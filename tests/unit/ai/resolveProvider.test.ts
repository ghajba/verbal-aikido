import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolveAiProvider } from '../../../src/ai/resolveProvider';
import { MemoryDriver } from '../../../src/storage/memory';
import { MockAiProvider } from '../../../src/ai/providers/mockProvider';
import { ByoKeyProvider } from '../../../src/ai/providers/byoKeyProvider';
import { WebLlmProvider } from '../../../src/ai/providers/webLlmProvider';

describe('resolveAiProvider utility', () => {
  let storage: MemoryDriver;
  const originalNavigator = globalThis.navigator;

  beforeEach(() => {
    storage = new MemoryDriver();
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'navigator', {
      value: originalNavigator,
      configurable: true,
    });
  });

  it('resolves ByoKeyProvider when mode is byokey and apiKey is present', async () => {
    await storage.put('settings', 'aiConfig', {
      mode: 'byokey',
      service: 'claude',
      apiKey: 'sk-ant-test',
    });

    const provider = await resolveAiProvider(storage);
    expect(provider).toBeInstanceOf(ByoKeyProvider);
    expect(provider.id).toBe('byokey');
  });

  it('resolves MockAiProvider when mode is explicitly set to mock', async () => {
    await storage.put('settings', 'aiConfig', {
      mode: 'mock',
    });

    const provider = await resolveAiProvider(storage);
    expect(provider).toBeInstanceOf(MockAiProvider);
    expect(provider.id).toBe('mock');
  });

  it('resolves WebLlmProvider when mode is webllm and WebGPU is supported', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        gpu: {
          requestAdapter: vi.fn().mockResolvedValue({ name: 'Mock GPU' }),
        },
      },
      configurable: true,
    });

    await storage.put('settings', 'aiConfig', {
      mode: 'webllm',
    });

    const provider = await resolveAiProvider(storage);
    expect(provider).toBeInstanceOf(WebLlmProvider);
    expect(provider.id).toBe('webllm');
  });

  it('falls back to MockAiProvider when mode is webllm but WebGPU is unsupported', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: {},
      configurable: true,
    });

    await storage.put('settings', 'aiConfig', {
      mode: 'webllm',
    });

    const provider = await resolveAiProvider(storage);
    expect(provider).toBeInstanceOf(MockAiProvider);
  });

  it('auto-detects WebLlmProvider when mode is unconfigured but WebGPU is supported', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        gpu: {
          requestAdapter: vi.fn().mockResolvedValue({ name: 'Mock GPU' }),
        },
      },
      configurable: true,
    });

    const provider = await resolveAiProvider(storage);
    expect(provider).toBeInstanceOf(WebLlmProvider);
  });

  it('auto-detects MockAiProvider when mode is unconfigured and WebGPU is unsupported', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: {},
      configurable: true,
    });

    const provider = await resolveAiProvider(storage);
    expect(provider).toBeInstanceOf(MockAiProvider);
  });
});
