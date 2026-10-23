export type WebGpuStatus = 'SUPPORTED' | 'NO_NAVIGATOR_GPU' | 'ADAPTER_FAILED' | 'EXCEPTION';

export interface WebGpuCheckResult {
  supported: boolean;
  status: WebGpuStatus;
  message?: string;
}

export async function checkWebGpuSupport(): Promise<WebGpuCheckResult> {
  if (typeof navigator === 'undefined' || !('gpu' in navigator)) {
    return {
      supported: false,
      status: 'NO_NAVIGATOR_GPU',
      message: 'WebGPU is not supported by your browser.',
    };
  }

  try {
    const gpu = (navigator as unknown as { gpu: { requestAdapter: () => Promise<unknown> } }).gpu;
    if (!gpu || typeof gpu.requestAdapter !== 'function') {
      return {
        supported: false,
        status: 'NO_NAVIGATOR_GPU',
        message: 'Navigator GPU interface is incomplete.',
      };
    }

    const adapter = await gpu.requestAdapter();
    if (!adapter) {
      return {
        supported: false,
        status: 'ADAPTER_FAILED',
        message:
          'WebGPU hardware adapter could not be initialized (hardware acceleration may be disabled).',
      };
    }

    return {
      supported: true,
      status: 'SUPPORTED',
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      supported: false,
      status: 'EXCEPTION',
      message: errorMsg,
    };
  }
}
