import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebLlmProvider } from '../../../src/ai/providers/webLlmProvider';
import type { AiTurnContext } from '../../../src/ai/types';
import { checkWebGpuSupport } from '../../../src/ai/webgpu';
import { handleWorkerMessage } from '../../../src/ai/worker/webLlmWorker';

class MockWorker {
  listeners: Record<string, ((event: any) => void)[]> = {};
  messagesSent: any[] = [];
  terminated = false;

  addEventListener(type: string, listener: (event: any) => void) {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(listener);
  }

  removeEventListener(type: string, listener: (event: any) => void) {
    if (this.listeners[type]) {
      this.listeners[type] = this.listeners[type].filter((l) => l !== listener);
    }
  }

  postMessage(data: any) {
    this.messagesSent.push(data);
  }

  terminate() {
    this.terminated = true;
  }

  simulateIncomingMessage(data: any) {
    const list = this.listeners['message'] || [];
    for (const listener of list) {
      listener({ data });
    }
  }
}

describe('WebGPU Detection Utility', () => {
  const originalNavigator = globalThis.navigator;

  afterEach(() => {
    Object.defineProperty(globalThis, 'navigator', {
      value: originalNavigator,
      configurable: true,
    });
  });

  it('detects when navigator.gpu is missing or incomplete', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: {},
      configurable: true,
    });
    const resultNoGpu = await checkWebGpuSupport();
    expect(resultNoGpu.supported).toBe(false);
    expect(resultNoGpu.status).toBe('NO_NAVIGATOR_GPU');

    Object.defineProperty(globalThis, 'navigator', {
      value: { gpu: {} }, // requestAdapter missing
      configurable: true,
    });
    const resultIncomplete = await checkWebGpuSupport();
    expect(resultIncomplete.supported).toBe(false);
    expect(resultIncomplete.status).toBe('NO_NAVIGATOR_GPU');
  });

  it('detects when requestAdapter returns null', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        gpu: {
          requestAdapter: vi.fn().mockResolvedValue(null),
        },
      },
      configurable: true,
    });
    const result = await checkWebGpuSupport();
    expect(result.supported).toBe(false);
    expect(result.status).toBe('ADAPTER_FAILED');
  });

  it('detects when requestAdapter succeeds', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        gpu: {
          requestAdapter: vi.fn().mockResolvedValue({ name: 'Mock GPU' }),
        },
      },
      configurable: true,
    });
    const result = await checkWebGpuSupport();
    expect(result.supported).toBe(true);
    expect(result.status).toBe('SUPPORTED');
  });

  it('handles requestAdapter throwing an error or non-Error object', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        gpu: {
          requestAdapter: vi.fn().mockRejectedValue(new Error('GPU disabled')),
        },
      },
      configurable: true,
    });
    const result = await checkWebGpuSupport();
    expect(result.supported).toBe(false);
    expect(result.status).toBe('EXCEPTION');
    expect(result.message).toContain('GPU disabled');

    // Non-Error exception
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        gpu: {
          requestAdapter: vi.fn().mockRejectedValue('String GPU failure'),
        },
      },
      configurable: true,
    });
    const stringResult = await checkWebGpuSupport();
    expect(stringResult.status).toBe('EXCEPTION');
    expect(stringResult.message).toBe('String GPU failure');
  });
});

describe('WebLlmProvider', () => {
  const baseContext: AiTurnContext = {
    archetypeId: 'angry_pm',
    npcProfile: {
      name: 'Kovács Péter',
      role: 'PM',
      coreConflict: 'Release deadline',
      personality: 'Angry',
    },
    turnIndex: 0,
    currentMetrics: { escalation: 65, grounding: 100, confusion: 0 },
    momentum: 0,
    history: [],
    locale: 'hu',
  };

  const sampleValidNodeJson = JSON.stringify({
    npcReaction: 'Péter elcsendesedik.',
    nextStatement: 'De mi a terv a holnapra?',
    nextTone: 'TENSE',
    cards: [
      { category: 'PACING', text: 'Látom a feszültséget.', debriefHint: 'H1' },
      { category: 'META_MODEL', text: 'Pontosan mi hiányzik?', debriefHint: 'H2' },
      { category: 'ATTACK', text: 'Te miért nem segítettél?', debriefHint: 'H3' },
    ],
  });

  let mockWorker: MockWorker;

  beforeEach(() => {
    mockWorker = new MockWorker();
  });

  it('initializes using custom workerFactory', async () => {
    const provider = new WebLlmProvider();
    provider.setWorkerFactory(() => mockWorker as unknown as Worker);

    const initPromise = provider.initialize();
    expect(mockWorker.messagesSent).toHaveLength(1);
    expect(mockWorker.messagesSent[0].type).toBe('INIT');

    mockWorker.simulateIncomingMessage({ type: 'INIT_DONE' });
    await initPromise;
    expect(await provider.isAvailable()).toBeDefined();
  });

  it('initializes and receives progress reports', async () => {
    const progressReports: { progress: number; text: string }[] = [];
    const provider = new WebLlmProvider({
      worker: mockWorker as unknown as Worker,
      onProgress: (progress, text) => progressReports.push({ progress, text }),
    });

    const initPromise = provider.initialize();

    expect(mockWorker.messagesSent).toHaveLength(1);
    expect(mockWorker.messagesSent[0].type).toBe('INIT');

    mockWorker.simulateIncomingMessage({
      type: 'INIT_PROGRESS',
      progress: 0.5,
      text: 'Loading weights...',
    });
    expect(progressReports).toHaveLength(1);
    expect(progressReports[0]!.progress).toBe(0.5);

    mockWorker.simulateIncomingMessage({ type: 'INIT_DONE' });
    await initPromise;

    // Subsequent initialize calls return immediately
    await provider.initialize();
  });

  it('handles initialization failure', async () => {
    const provider = new WebLlmProvider({
      worker: mockWorker as unknown as Worker,
    });

    const initPromise = provider.initialize();
    mockWorker.simulateIncomingMessage({
      type: 'ERROR',
      error: 'Failed to compile shaders',
    });

    await expect(initPromise).rejects.toThrow('Failed to compile shaders');
  });

  it('generates next node successfully', async () => {
    const provider = new WebLlmProvider({
      worker: mockWorker as unknown as Worker,
    });

    const initPromise = provider.initialize();
    mockWorker.simulateIncomingMessage({ type: 'INIT_DONE' });
    await initPromise;

    const generatePromise = provider.generateNextNode(baseContext);

    expect(mockWorker.messagesSent).toHaveLength(2);
    const generateMsg = mockWorker.messagesSent[1];
    expect(generateMsg.type).toBe('GENERATE');
    expect(generateMsg.context).toEqual(baseContext);

    mockWorker.simulateIncomingMessage({
      type: 'GENERATE_RESULT',
      requestId: generateMsg.requestId,
      resultJson: sampleValidNodeJson,
    });

    const node = await generatePromise;
    expect(node.npcReaction).toBe('Péter elcsendesedik.');
    expect(node.cards).toHaveLength(3);
  });

  it('handles generation error message from worker', async () => {
    const provider = new WebLlmProvider({
      worker: mockWorker as unknown as Worker,
    });

    const initPromise = provider.initialize();
    mockWorker.simulateIncomingMessage({ type: 'INIT_DONE' });
    await initPromise;

    const generatePromise = provider.generateNextNode(baseContext);
    const generateMsg = mockWorker.messagesSent[1];

    mockWorker.simulateIncomingMessage({
      type: 'ERROR',
      requestId: generateMsg.requestId,
      error: 'CUDA Out of Memory',
    });

    await expect(generatePromise).rejects.toThrow('CUDA Out of Memory');
  });

  it('handles invalid JSON in GENERATE_RESULT', async () => {
    const provider = new WebLlmProvider({
      worker: mockWorker as unknown as Worker,
    });

    const initPromise = provider.initialize();
    mockWorker.simulateIncomingMessage({ type: 'INIT_DONE' });
    await initPromise;

    const generatePromise = provider.generateNextNode(baseContext);
    const generateMsg = mockWorker.messagesSent[1];

    mockWorker.simulateIncomingMessage({
      type: 'GENERATE_RESULT',
      requestId: generateMsg.requestId,
      resultJson: '{ invalid json',
    });

    await expect(generatePromise).rejects.toThrow();
  });

  it('handles generation timeout', async () => {
    const provider = new WebLlmProvider({
      worker: mockWorker as unknown as Worker,
      timeoutMs: 10,
    });

    const initPromise = provider.initialize();
    mockWorker.simulateIncomingMessage({ type: 'INIT_DONE' });
    await initPromise;

    const generatePromise = provider.generateNextNode(baseContext);
    await expect(generatePromise).rejects.toThrow('WebLLM generation timed out after 10ms');
  });

  it('throws an error if postWorkerMessage is called without worker', () => {
    const provider = new WebLlmProvider();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => (provider as any).postWorkerMessage({ type: 'INIT', modelName: 'test' })).toThrow(
      'Worker is not available'
    );
  });

  it('terminates worker and resets state', async () => {
    const provider = new WebLlmProvider({
      worker: mockWorker as unknown as Worker,
    });

    provider.terminate();
    expect(mockWorker.terminated).toBe(true);
  });

  it('automatically initializes when generateNextNode is called uninitialized', async () => {
    const provider = new WebLlmProvider({
      worker: mockWorker as unknown as Worker,
      timeoutMs: 500,
    });

    const promise = provider.generateNextNode(baseContext);

    // Let initialize() post INIT
    await new Promise((r) => setTimeout(r, 10));
    mockWorker.simulateIncomingMessage({ type: 'INIT_DONE' });

    // Allow generateNextNode to continue after initialize()
    await new Promise((r) => setTimeout(r, 10));

    const genMsg = mockWorker.messagesSent.find((m) => m.type === 'GENERATE');
    mockWorker.simulateIncomingMessage({
      type: 'GENERATE_RESULT',
      requestId: genMsg?.requestId,
      resultJson: sampleValidNodeJson,
    });

    const result = await promise;
    expect(result.npcReaction).toBe('Péter elcsendesedik.');
  });

  it('handles worker instantiation failure or non-Error exception', async () => {
    const provider = new WebLlmProvider({
      workerFactory: () => {
        throw 'String error during worker init';
      },
    });

    await expect(provider.initialize()).rejects.toThrow('String error during worker init');
  });

  it('instantiates default Worker when worker and workerFactory are omitted', async () => {
    const originalWorker = (globalThis as any).Worker;
    const workerMockInstance = new MockWorker();
    (globalThis as any).Worker = vi.fn().mockImplementation(() => workerMockInstance);

    const provider = new WebLlmProvider();
    const initPromise = provider.initialize();
    workerMockInstance.simulateIncomingMessage({ type: 'INIT_DONE' });
    await initPromise;

    expect((globalThis as any).Worker).toHaveBeenCalled();
    (globalThis as any).Worker = originalWorker;
  });
});

describe('WebLLM Worker Message Handler', () => {
  const baseContext: AiTurnContext = {
    archetypeId: 'angry_pm',
    npcProfile: {
      name: 'Kovács Péter',
      role: 'PM',
      coreConflict: 'Release deadline',
      personality: 'Angry',
    },
    turnIndex: 0,
    currentMetrics: { escalation: 65, grounding: 100, confusion: 0 },
    momentum: 0,
    history: [],
    locale: 'hu',
  };

  it('reports error when generating before INIT', async () => {
    const outMessages: any[] = [];
    await handleWorkerMessage(
      { type: 'GENERATE', requestId: 'req-1', context: baseContext },
      (msg) => outMessages.push(msg)
    );

    expect(outMessages).toHaveLength(1);
    expect(outMessages[0].type).toBe('ERROR');
    expect(outMessages[0].error).toContain('WebLLM engine is not initialized');
  });

  it('reports error during INIT when @mlc-ai/web-llm is not installed', async () => {
    const outMessages: any[] = [];
    await handleWorkerMessage({ type: 'INIT', modelName: 'test-model' }, (msg) =>
      outMessages.push(msg)
    );

    expect(outMessages.some((m) => m.type === 'INIT_PROGRESS')).toBe(true);
    expect(outMessages.some((m) => m.type === 'ERROR')).toBe(true);
  });
});
