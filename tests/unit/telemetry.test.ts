import { describe, it, expect, vi } from 'vitest';
import { MemoryDriver } from '@/storage/memory';
import * as telemetry from '@/telemetry/index';
import { TelemetryBuffer } from '@/telemetry/buffer';
import { flush } from '@/telemetry/sync';

describe('Telemetry & Sync Engine', () => {
  it('SBE-TEL-001: card_played event content', async () => {
    const driver = new MemoryDriver();
    const buffer = new TelemetryBuffer(driver, '1.0.0');

    const ev = await buffer.recordCardPlayed({
      runId: 'run-gld-002',
      scenarioId: 'scen_angry_pm_deadline_001',
      turn: 1,
      nodeId: 'step_01',
      cardId: 'c_attack_01',
      category: 'ATTACK',
      timedOut: false,
      decisionMs: 3200,
      E: 100,
      F: 68.75,
      K: 0,
    });

    expect(ev.name).toBe('card_played');
    expect(ev.props).toEqual({
      turn: 1,
      nodeId: 'step_01',
      cardId: 'c_attack_01',
      category: 'ATTACK',
      timedOut: false,
      decisionMs: 3200,
      E: 100,
      F: 68.75,
      K: 0,
    });
    expect(ev.appVersion).toBe('1.0.0');
    expect(ev.runId).toBe('run-gld-002');
    expect(ev.scenarioId).toBe('scen_angry_pm_deadline_001');

    // Confirm stored in analyticsQueue
    expect(await driver.count('analyticsQueue')).toBe(1);
  });

  it('SBE-TEL-002: scenario_end event content', async () => {
    const driver = new MemoryDriver();
    const buffer = new TelemetryBuffer(driver, '1.0.0');

    const ev = await buffer.recordScenarioEnd({
      runId: 'run-pnc-003',
      scenarioId: 'scen_angry_pm_deadline_001',
      outcome: 'LOSS_RUPTURE',
      turns: 2,
      panicSec: 4.6,
      rtoSec: null,
      constructive: 0,
      reactive: 2,
      locale: 'en',
    });

    expect(ev.name).toBe('scenario_end');
    expect(ev.props).toEqual({
      outcome: 'LOSS_RUPTURE',
      turns: 2,
      panicSec: 4.6,
      rtoSec: null,
      constructive: 0,
      reactive: 2,
      locale: 'en',
    });
  });

  it('SBE-TEL-003: Events contain no personal data and use valid UUIDs', async () => {
    const driver = new MemoryDriver();
    const buffer = new TelemetryBuffer(driver, '1.0.0');

    const ev = await buffer.record('app_open', {
      storage: 'indexeddb',
      standalone: false,
      online: true,
      locale: 'hu',
      localeSource: 'setting',
    });

    expect(ev.eventId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    // Keys in props must only contain allowed system keys, no user personal data
    const keys = Object.keys(ev.props);
    expect(keys).not.toContain('email');
    expect(keys).not.toContain('username');
    expect(keys).not.toContain('name');
  });

  it('SBE-TEL-004: Default build with empty sync endpoint sends nothing', async () => {
    const driver = new MemoryDriver();
    await driver.append('analyticsQueue', { test: 1 });

    const fetchMock = vi.fn();
    const res = await flush(driver, {
      endpoint: '', // empty endpoint
      fetchFn: fetchMock as any,
    });

    expect(res).toEqual({ sent: 0, dropped: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await driver.count('analyticsQueue')).toBe(1);
  });

  it('SBE-TEL-005 & SBE-TEL-007: Sync responses and batch request body', async () => {
    const endpoint = 'https://sync.example.test';

    // 1. Response 202: 150 events queued -> first 100 deleted, 50 remain
    {
      const driver = new MemoryDriver();
      for (let i = 1; i <= 150; i++) {
        await driver.append('analyticsQueue', { id: i });
      }

      let capturedUrl = '';
      let capturedBody: any = null;

      const mockFetch202 = vi.fn(async (url: string, init: any) => {
        capturedUrl = url;
        capturedBody = JSON.parse(init.body);
        return { status: 202 } as Response;
      });

      const res = await flush(driver, {
        endpoint,
        clientId: 'test-client-uuid',
        appVersion: '1.0.0',
        fetchFn: mockFetch202 as any,
      });

      expect(res.status).toBe(202);
      expect(res.sent).toBe(100);
      expect(res.dropped).toBe(0);
      expect(await driver.count('analyticsQueue')).toBe(50);

      // Verify SBE-TEL-007 request body
      expect(capturedUrl).toBe('https://sync.example.test/v1/events:batch');
      expect(capturedBody.clientId).toBe('test-client-uuid');
      expect(capturedBody.appVersion).toBe('1.0.0');
      expect(capturedBody.events.length).toBe(100);
      expect(capturedBody.sentAt).toBeDefined();
    }

    // 2. Response 400: batch of 100 dropped, 50 remain
    {
      const driver = new MemoryDriver();
      for (let i = 1; i <= 150; i++) {
        await driver.append('analyticsQueue', { id: i });
      }

      const mockFetch400 = vi.fn(async () => ({ status: 400 }) as Response);
      const res = await flush(driver, {
        endpoint,
        fetchFn: mockFetch400 as any,
      });

      expect(res.status).toBe(400);
      expect(res.sent).toBe(0);
      expect(res.dropped).toBe(100);
      expect(await driver.count('analyticsQueue')).toBe(50);
    }

    // 3. Response 503: 150 remain and retry is scheduled in 30s
    {
      const driver = new MemoryDriver();
      for (let i = 1; i <= 150; i++) {
        await driver.append('analyticsQueue', { id: i });
      }

      const mockFetch503 = vi.fn(async () => ({ status: 503 }) as Response);
      let scheduledDelay: number | undefined;
      const res = await flush(driver, {
        endpoint,
        retryAttempt: 0,
        fetchFn: mockFetch503 as any,
        onRetryScheduled: (delay) => {
          scheduledDelay = delay;
        },
      });

      expect(res.status).toBe(503);
      expect(res.sent).toBe(0);
      expect(res.dropped).toBe(0);
      expect(await driver.count('analyticsQueue')).toBe(150);
      expect(scheduledDelay).toBe(30_000); // 30s
    }

    // 4. Network failure: 150 remain and retry is scheduled in 30s
    {
      const driver = new MemoryDriver();
      for (let i = 1; i <= 150; i++) {
        await driver.append('analyticsQueue', { id: i });
      }

      const mockFetchFail = vi.fn(async () => {
        throw new Error('Network error');
      });
      let scheduledDelay: number | undefined;
      const res = await flush(driver, {
        endpoint,
        retryAttempt: 0,
        fetchFn: mockFetchFail as any,
        onRetryScheduled: (delay) => {
          scheduledDelay = delay;
        },
      });

      expect(res.status).toBe(0);
      expect(res.sent).toBe(0);
      expect(res.dropped).toBe(0);
      expect(await driver.count('analyticsQueue')).toBe(150);
      expect(scheduledDelay).toBe(30_000);
    }
  });

  it('SBE-TEL-006: Retry backoff stages (30s, 2m, 10m, then stop)', async () => {
    const endpoint = 'https://sync.example.test';
    const driver = new MemoryDriver();
    await driver.append('analyticsQueue', { test: 1 });

    const mockFetch500 = vi.fn(async () => ({ status: 500 }) as Response);

    // Attempt 0: 30s
    const res0 = await flush(driver, {
      endpoint,
      retryAttempt: 0,
      fetchFn: mockFetch500 as any,
    });
    expect(res0.retryScheduledInMs).toBe(30_000);

    // Attempt 1: 2 min
    const res1 = await flush(driver, {
      endpoint,
      retryAttempt: 1,
      fetchFn: mockFetch500 as any,
    });
    expect(res1.retryScheduledInMs).toBe(120_000);

    // Attempt 2: 10 min
    const res2 = await flush(driver, {
      endpoint,
      retryAttempt: 2,
      fetchFn: mockFetch500 as any,
    });
    expect(res2.retryScheduledInMs).toBe(600_000);

    // Attempt 3: stopped (undefined)
    const res3 = await flush(driver, {
      endpoint,
      retryAttempt: 3,
      fetchFn: mockFetch500 as any,
    });
    expect(res3.retryScheduledInMs).toBeUndefined();
  });

  it('records scenario_start event', async () => {
    const driver = new MemoryDriver();
    const buffer = new TelemetryBuffer(driver, '1.0.0');

    const ev = await buffer.recordScenarioStart({
      runId: 'run-start-test',
      scenarioId: 'scen_01',
      difficulty: 'MEDIUM',
      seed: 12345,
      locale: 'de',
    });

    expect(ev.name).toBe('scenario_start');
    expect(ev.props).toEqual({
      difficulty: 'MEDIUM',
      seed: 12345,
      resumed: false,
      locale: 'de',
    });
  });

  it('flush returns early if analyticsQueue is empty or onRetryScheduled is omitted', async () => {
    const driver = new MemoryDriver();
    const endpoint = 'https://sync.example.test';

    // Empty queue
    const emptyRes = await flush(driver, { endpoint });
    expect(emptyRes).toEqual({ sent: 0, dropped: 0 });

    // Queue has items, server 500 with no callback
    await driver.append('analyticsQueue', { test: 1 });
    const mock500 = vi.fn(async () => ({ status: 500 }) as Response);
    const resNoCb = await flush(driver, {
      endpoint,
      fetchFn: mock500 as any,
    });
    expect(resNoCb.retryScheduledInMs).toBe(30_000);

    // Network error with no callback
    const mockNetErr = vi.fn(async () => {
      throw new Error('fail');
    });
    const resNetNoCb = await flush(driver, {
      endpoint,
      fetchFn: mockNetErr as any,
    });
    expect(resNetNoCb.retryScheduledInMs).toBe(30_000);

    // Network error on attempt >= 3
    const resNetAttempt3 = await flush(driver, {
      endpoint,
      retryAttempt: 3,
      fetchFn: mockNetErr as any,
    });
    expect(resNetAttempt3.retryScheduledInMs).toBeUndefined();
  });

  it('exports TelemetryBuffer and flush from index and supports timedOut: true and undefined', async () => {
    expect(telemetry.TelemetryBuffer).toBeDefined();
    expect(telemetry.flush).toBeDefined();

    const driver = new MemoryDriver();
    const buffer = new telemetry.TelemetryBuffer(driver, '1.0.0');

    // timedOut omitted
    const evOmitted = await buffer.recordCardPlayed({
      runId: 'run-omitted',
      scenarioId: 'scen_01',
      turn: 1,
      nodeId: 'step_01',
      cardId: 'c_01',
      category: 'PACING',
      decisionMs: 5000,
      E: 50,
      F: 50,
      K: 50,
    });
    expect(evOmitted.props['timedOut']).toBe(false);

    // timedOut: true
    const ev = await buffer.recordCardPlayed({
      runId: 'run-timeout',
      scenarioId: 'scen_01',
      turn: 1,
      nodeId: 'step_01',
      cardId: 'c_01',
      category: 'PACING',
      timedOut: true,
      decisionMs: 15000,
      E: 50,
      F: 50,
      K: 50,
    });
    expect(ev.props['timedOut']).toBe(true);

    // flush with default clientId and appVersion
    const mock202 = vi.fn(async () => ({ status: 202 }) as Response);
    const flushRes = await telemetry.flush(driver, {
      endpoint: 'https://sync.example.test',
      fetchFn: mock202 as any,
    });
    expect(flushRes.status).toBe(202);
  });
});
