import type { StorageDriver, TelemetryEvent } from '../storage/types';

export const RETRY_DELAYS_MS = [30_000, 120_000, 600_000]; // 30s, 2min, 10min per Section 13.4

export interface FlushOptions {
  endpoint?: string;
  clientId?: string;
  appVersion?: string;
  fetchFn?: typeof fetch;
  retryAttempt?: number;
  onRetryScheduled?: (delayMs: number, nextAttempt: number) => void;
}

export interface FlushResult {
  sent: number;
  dropped: number;
  status?: number;
  retryScheduledInMs?: number;
}

export interface SyncBatchPayload {
  clientId: string;
  appVersion: string;
  sentAt: string;
  events: TelemetryEvent[];
}

export async function flush(
  driver: StorageDriver,
  options: FlushOptions = {}
): Promise<FlushResult> {
  const endpoint = options.endpoint ?? import.meta.env.VITE_SYNC_ENDPOINT;
  // Section 13.1 guard: top statement inside flush
  if (!endpoint) {
    return { sent: 0, dropped: 0 };
  }

  const batch = await driver.takeBatch<TelemetryEvent>('analyticsQueue', 100);
  if (batch.values.length === 0) {
    return { sent: 0, dropped: 0 };
  }

  const fetchFn = options.fetchFn ?? fetch;
  const payload: SyncBatchPayload = {
    clientId: options.clientId ?? 'anonymous',
    appVersion: options.appVersion ?? '1.0.0',
    sentAt: new Date().toISOString(),
    events: batch.values,
  };

  const currentAttempt = options.retryAttempt ?? 0;

  try {
    const res = await fetchFn(`${endpoint}/v1/events:batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (res.status === 202) {
      // 202: delete sent keys
      await driver.deleteKeys('analyticsQueue', batch.keys);
      return { sent: batch.values.length, dropped: 0, status: 202 };
    }

    if (res.status >= 400 && res.status < 500) {
      // 4xx: drop batch, do not retry
      await driver.deleteKeys('analyticsQueue', batch.keys);
      return { sent: 0, dropped: batch.values.length, status: res.status };
    }

    // 5xx: schedule retry with backoff
    const delay =
      currentAttempt < RETRY_DELAYS_MS.length ? RETRY_DELAYS_MS[currentAttempt]! : undefined;

    if (delay !== undefined && options.onRetryScheduled) {
      options.onRetryScheduled(delay, currentAttempt + 1);
    }

    return {
      sent: 0,
      dropped: 0,
      status: res.status,
      retryScheduledInMs: delay,
    };
  } catch {
    // Network failure: keep batch, schedule retry
    const delay =
      currentAttempt < RETRY_DELAYS_MS.length ? RETRY_DELAYS_MS[currentAttempt]! : undefined;

    if (delay !== undefined && options.onRetryScheduled) {
      options.onRetryScheduled(delay, currentAttempt + 1);
    }

    return {
      sent: 0,
      dropped: 0,
      status: 0,
      retryScheduledInMs: delay,
    };
  }
}
