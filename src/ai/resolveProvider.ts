import type { StorageDriver } from '../storage/types';
import type { AiProvider, ByoServiceId } from './types';
import { MockAiProvider } from './providers/mockProvider';
import { ByoKeyProvider } from './providers/byoKeyProvider';
import { WebLlmProvider } from './providers/webLlmProvider';
import { checkWebGpuSupport } from './webgpu';

export interface AiConfig {
  mode?: 'classic' | 'webllm' | 'byokey' | 'mock';
  service?: ByoServiceId;
  apiKey?: string;
  baseUrl?: string;
}

export async function resolveAiProvider(
  storage: StorageDriver,
  onProgress?: (progress: number, text: string) => void
): Promise<AiProvider> {
  const config = await storage.get<AiConfig>('settings', 'aiConfig');
  const mode = config?.mode;

  if (mode === 'byokey' && config?.apiKey) {
    return new ByoKeyProvider({
      service: config.service || 'gemini',
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
    });
  }

  if (mode === 'mock') {
    return new MockAiProvider({ delayMs: 400 });
  }

  if (mode === 'webllm') {
    const gpuCheck = await checkWebGpuSupport();
    if (gpuCheck.supported) {
      return new WebLlmProvider({ onProgress });
    }
    // WebGPU unsupported fallback
    return new MockAiProvider({ delayMs: 400 });
  }

  // Auto-detect default if mode is not explicitly configured
  const gpu = await checkWebGpuSupport();
  if (gpu.supported) {
    return new WebLlmProvider({ onProgress });
  }

  return new MockAiProvider({ delayMs: 400 });
}
