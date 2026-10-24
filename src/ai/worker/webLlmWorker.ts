import { buildTurnPrompt } from '../prompts';
import { validateAiNode } from '../schema';
import type { AiTurnContext } from '../types';

export interface WorkerInitMessage {
  type: 'INIT';
  modelName: string;
}

export interface WorkerGenerateMessage {
  type: 'GENERATE';
  requestId: string;
  context: AiTurnContext;
}

export type WorkerInMessage = WorkerInitMessage | WorkerGenerateMessage;

export type WorkerOutMessage =
  | { type: 'INIT_PROGRESS'; progress: number; text: string }
  | { type: 'INIT_DONE' }
  | { type: 'GENERATE_RESULT'; requestId: string; resultJson: string }
  | { type: 'ERROR'; requestId?: string; error: string };

// WebLLM engine instance placeholder in worker scope
let engine: any = null;
let currentModel = '';

export async function handleWorkerMessage(
  msg: WorkerInMessage,
  post: (response: WorkerOutMessage) => void
): Promise<void> {
  try {
    if (msg.type === 'INIT') {
      currentModel = msg.modelName;
      post({ type: 'INIT_PROGRESS', progress: 0.1, text: `Initializing ${currentModel}...` });

      // Dynamic import with vite-ignore to prevent bundler hard dependency
      let webllm: any = null;
      const candidates = [
        '@mlc-ai/web-llm',
        'https://esm.run/@mlc-ai/web-llm',
        'https://esm.sh/@mlc-ai/web-llm',
      ];

      for (const url of candidates) {
        try {
          const mod = await import(/* @vite-ignore */ url);
          if (mod && (mod.CreateMLCEngine || mod.default?.CreateMLCEngine)) {
            webllm = mod.CreateMLCEngine ? mod : mod.default;
            break;
          }
        } catch {
          // continue fallback
        }
      }

      if (!webllm) {
        throw new Error('@mlc-ai/web-llm is not installed or available in this environment.');
      }

      engine = await webllm.CreateMLCEngine(currentModel, {
        initProgressCallback: (report: { progress: number; text: string }) => {
          post({
            type: 'INIT_PROGRESS',
            progress: report.progress,
            text: report.text,
          });
        },
      });

      post({ type: 'INIT_DONE' });
      return;
    }

    if (msg.type === 'GENERATE') {
      if (!engine) {
        throw new Error('WebLLM engine is not initialized. Send INIT first.');
      }

      const { systemPrompt, userPrompt } = buildTurnPrompt(msg.context);

      const reply = await engine.chat.completions.create({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
      });

      const text = reply.choices[0]?.message?.content || '{}';
      // Quick validation before posting back
      const parsed = JSON.parse(text);
      validateAiNode(parsed);

      post({
        type: 'GENERATE_RESULT',
        requestId: msg.requestId,
        resultJson: text,
      });
    }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    post({
      type: 'ERROR',
      requestId: 'requestId' in msg ? msg.requestId : undefined,
      error: errorMsg,
    });
  }
}

// In real worker environment, wire self.onmessage
if (typeof self !== 'undefined' && typeof (self as any).postMessage === 'function') {
  self.onmessage = (event: MessageEvent<WorkerInMessage>) => {
    handleWorkerMessage(event.data, (out) => (self as any).postMessage(out));
  };
}
