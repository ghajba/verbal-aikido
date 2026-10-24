import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/preact';
import { ModelProgressModal } from '../../../src/ui/components/ModelProgressModal';

describe('ModelProgressModal component', () => {
  it('does not render when isOpen is false', () => {
    const { container } = render(<ModelProgressModal isOpen={false} progress={0} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders modal dialog with progress and text', () => {
    render(
      <ModelProgressModal isOpen={true} progress={0.42} text="Loading weights 120MB / 350MB..." />
    );

    expect(screen.getByTestId('model-progress-modal')).toBeDefined();
    expect(screen.getByRole('dialog')).toBeDefined();

    const progressBar = screen.getByRole('progressbar');
    expect(progressBar.getAttribute('aria-valuenow')).toBe('42');
    expect(screen.getByTestId('model-progress-text').textContent).toBe(
      'Loading weights 120MB / 350MB...'
    );
    expect(screen.getByTestId('model-progress-percentage').textContent).toBe('42%');
    expect(screen.queryByTestId('model-progress-cancel-btn')).toBeNull();
  });

  it('supports percentage progress values > 1 and clamps to 0-100', () => {
    const { rerender } = render(<ModelProgressModal isOpen={true} progress={75} />);
    expect(screen.getByTestId('model-progress-percentage').textContent).toBe('75%');

    // Over 100
    rerender(<ModelProgressModal isOpen={true} progress={150} />);
    expect(screen.getByTestId('model-progress-percentage').textContent).toBe('100%');

    // Negative
    rerender(<ModelProgressModal isOpen={true} progress={-20} />);
    expect(screen.getByTestId('model-progress-percentage').textContent).toBe('0%');
  });

  it('triggers onCancel callback when cancel button clicked', () => {
    const handleCancel = vi.fn();
    render(<ModelProgressModal isOpen={true} progress={0.1} onCancel={handleCancel} />);

    const cancelBtn = screen.getByTestId('model-progress-cancel-btn');
    expect(cancelBtn).toBeDefined();
    fireEvent.click(cancelBtn);
    expect(handleCancel).toHaveBeenCalledTimes(1);
  });

  it('renders error state and triggers action buttons', () => {
    const onRetry = vi.fn();
    const onFallbackSimulated = vi.fn();
    const onConfigureKey = vi.fn();
    const onCancel = vi.fn();

    render(
      <ModelProgressModal
        isOpen={true}
        progress={0}
        error="WebGPU device initialization failed"
        onRetry={onRetry}
        onFallbackSimulated={onFallbackSimulated}
        onConfigureKey={onConfigureKey}
        onCancel={onCancel}
      />
    );

    expect(screen.getByTestId('model-progress-error').textContent).toContain(
      'WebGPU device initialization failed'
    );

    // Click retry
    fireEvent.click(screen.getByTestId('model-progress-retry-btn'));
    expect(onRetry).toHaveBeenCalledTimes(1);

    // Click BYO Key
    fireEvent.click(screen.getByTestId('model-progress-byo-btn'));
    expect(onConfigureKey).toHaveBeenCalledTimes(1);

    // Click fallback simulated
    fireEvent.click(screen.getByTestId('model-progress-simulated-btn'));
    expect(onFallbackSimulated).toHaveBeenCalledTimes(1);

    // Click cancel
    fireEvent.click(screen.getByTestId('model-progress-cancel-btn'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
