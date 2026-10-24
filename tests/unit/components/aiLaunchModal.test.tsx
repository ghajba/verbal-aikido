import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/preact';
import { AiLaunchModal } from '../../../src/ui/components/AiLaunchModal';

describe('AiLaunchModal component', () => {
  it('returns null when isOpen is false', () => {
    const { container } = render(
      <AiLaunchModal
        isOpen={false}
        webGpuSupported={true}
        onStartWebLlm={vi.fn()}
        onStartSimulated={vi.fn()}
        onConfigureApiKey={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders WebGPU supported view with ~350 MB notice and triggers callbacks', () => {
    const onStartWebLlm = vi.fn();
    const onStartSimulated = vi.fn();
    const onConfigureApiKey = vi.fn();
    const onCancel = vi.fn();

    render(
      <AiLaunchModal
        isOpen={true}
        webGpuSupported={true}
        onStartWebLlm={onStartWebLlm}
        onStartSimulated={onStartSimulated}
        onConfigureApiKey={onConfigureApiKey}
        onCancel={onCancel}
      />
    );

    expect(screen.getByTestId('ai-launch-modal')).toBeDefined();
    expect(screen.getByTestId('webgpu-badge').textContent).toContain('WebGPU');
    expect(screen.getAllByText(/350 MB/i).length).toBeGreaterThanOrEqual(1);

    // Trigger start WebLLM
    const webLlmBtn = screen.getByTestId('ai-launch-webllm-btn');
    fireEvent.click(webLlmBtn);
    expect(onStartWebLlm).toHaveBeenCalledTimes(1);

    // Trigger start simulated
    const simBtn = screen.getByTestId('ai-launch-simulated-btn');
    fireEvent.click(simBtn);
    expect(onStartSimulated).toHaveBeenCalledTimes(1);

    // Trigger BYO-Key
    const byoBtn = screen.getByTestId('ai-launch-byo-btn');
    fireEvent.click(byoBtn);
    expect(onConfigureApiKey).toHaveBeenCalledTimes(1);

    // Trigger cancel
    const cancelBtn = screen.getByTestId('ai-launch-cancel-btn');
    fireEvent.click(cancelBtn);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('renders WebGPU unsupported view with options and handles Escape key', () => {
    const onCancel = vi.fn();
    const onConfigureApiKey = vi.fn();
    const onStartSimulated = vi.fn();

    render(
      <AiLaunchModal
        isOpen={true}
        webGpuSupported={false}
        onStartWebLlm={vi.fn()}
        onStartSimulated={onStartSimulated}
        onConfigureApiKey={onConfigureApiKey}
        onCancel={onCancel}
      />
    );

    expect(screen.getByTestId('ai-launch-modal')).toBeDefined();
    expect(screen.getByTestId('webgpu-badge').textContent).toContain('WebGPU');

    // WebLLM button should not exist when WebGPU is unsupported
    expect(screen.queryByTestId('ai-launch-webllm-btn')).toBeNull();

    // Configure key button exists
    const byoBtn = screen.getByTestId('ai-launch-byo-btn');
    fireEvent.click(byoBtn);
    expect(onConfigureApiKey).toHaveBeenCalledTimes(1);

    // Escape key triggers cancel
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
