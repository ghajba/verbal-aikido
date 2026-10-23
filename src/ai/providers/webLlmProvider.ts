import { validateAiNode } from '../schema';
import type { AiGeneratedNode, AiProvider, AiTurnContext } from '../types';
import { checkWebGpuSupport } from '../webgpu';
import type { WorkerInMessage, WorkerOutMessage } from '../worker/webLlmWorker';

export interface WebLlmProviderOptions {
  modelName?: string;
  worker?: Worker;
  workerFactory?: () => Worker;
  onProgress?: (progress: number, text: string) => void;
  timeoutMs?: number;
}

export class WebLlmProvider implements AiProvider {
  readonly id = 'webllm' as const;
  readonly name = 'WebLLM In-Browser (WebGPU)';

  private modelName: string;
  private worker: Worker | null = null;
  private workerFactory?: () => Worker;
  private onProgress?: (progress: number, text: string) => void;
  private timeoutMs: number;
  private isInitialized = false;
  private pendingRequests = new Map<
    string,
    { resolve: (node: AiGeneratedNode) => void; reject: (err: Error) => void }
  >();
  private initPromise: Promise<void> | null = null;

  constructor(options: WebLlmProviderOptions = {}) {
    this.modelName = options.modelName || 'SmolLM2-1.7B-Instruct-q4f16_1-MLC';
    this.onProgress = options.onProgress;
    this.timeoutMs = options.timeoutMs ?? 30000;
    this.workerFactory = options.workerFactory;

    if (options.worker) {
      this.worker = options.worker;
      this.attachWorkerListeners();
    }
  }

  setWorkerFactory(factory: () => Worker): void {
    this.workerFactory = factory;
  }

  async isAvailable(): Promise<boolean> {
    const check = await checkWebGpuSupport();
    return check.supported;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = new Promise<void>((resolve, reject) => {
      try {
        if (!this.worker) {
          if (this.workerFactory) {
            this.worker = this.workerFactory();
          } else {
            // Standard Vite worker instantiation
            this.worker = new Worker(new URL('../worker/webLlmWorker.ts', import.meta.url), {
              type: 'module',
            });
          }
          this.attachWorkerListeners();
        }

        const handleInitResponse = (event: MessageEvent<WorkerOutMessage>) => {
          const msg = event.data;
          if (msg.type === 'INIT_DONE') {
            this.isInitialized = true;
            this.worker?.removeEventListener('message', handleInitResponse);
            resolve();
          } else if (msg.type === 'ERROR' && !msg.requestId) {
            this.worker?.removeEventListener('message', handleInitResponse);
            reject(new Error(msg.error));
          }
        };

        this.worker.addEventListener('message', handleInitResponse);
        this.postWorkerMessage({ type: 'INIT', modelName: this.modelName });
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });

    return this.initPromise;
  }

  async generateNextNode(ctx: AiTurnContext): Promise<AiGeneratedNode> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    return new Promise<AiGeneratedNode>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(`WebLLM generation timed out after ${this.timeoutMs}ms`));
      }, this.timeoutMs);

      this.pendingRequests.set(requestId, {
        resolve: (node) => {
          clearTimeout(timer);
          resolve(node);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
      });

      this.postWorkerMessage({
        type: 'GENERATE',
        requestId,
        context: ctx,
      });
    });
  }

  terminate(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.isInitialized = false;
    this.initPromise = null;
    this.pendingRequests.clear();
  }

  private attachWorkerListeners(): void {
    if (!this.worker) return;

    this.worker.addEventListener('message', (event: MessageEvent<WorkerOutMessage>) => {
      const msg = event.data;

      if (msg.type === 'INIT_PROGRESS') {
        this.onProgress?.(msg.progress, msg.text);
      } else if (msg.type === 'GENERATE_RESULT') {
        const handler = this.pendingRequests.get(msg.requestId);
        if (handler) {
          this.pendingRequests.delete(msg.requestId);
          try {
            const parsed = JSON.parse(msg.resultJson);
            const validated = validateAiNode(parsed);
            handler.resolve(validated);
          } catch (err) {
            handler.reject(err instanceof Error ? err : new Error(String(err)));
          }
        }
      } else if (msg.type === 'ERROR' && msg.requestId) {
        const handler = this.pendingRequests.get(msg.requestId);
        if (handler) {
          this.pendingRequests.delete(msg.requestId);
          handler.reject(new Error(msg.error));
        }
      }
    });
  }

  private postWorkerMessage(msg: WorkerInMessage): void {
    if (!this.worker) {
      throw new Error('Worker is not available');
    }
    this.worker.postMessage(msg);
  }
}
