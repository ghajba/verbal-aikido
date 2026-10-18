export interface LiveRegionProps {
  politeMessage?: string;
  assertiveMessage?: string;
}

export function LiveRegion({ politeMessage = '', assertiveMessage = '' }: LiveRegionProps) {
  return (
    <div class="live-region-container" aria-hidden="false">
      <div
        class="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        data-testid="live-polite"
      >
        {politeMessage}
      </div>
      <div
        class="sr-only"
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
        data-testid="live-assertive"
      >
        {assertiveMessage}
      </div>
    </div>
  );
}
