import type { Scenario } from '../content/types';
import type { GameEvent, PersistedEvent, RunState } from './types';
import { gameReducer } from './fsm';

export function replay(
  scenario: Scenario,
  seed: number,
  events: readonly PersistedEvent[]
): RunState {
  if (events.length === 0) {
    throw new Error('Cannot replay empty event log');
  }

  const firstEvent = events[0]!;
  if (firstEvent.type !== 'START') {
    throw new Error('First event in replay log must be START');
  }

  const startEvent: GameEvent = {
    type: 'START',
    scenario,
    seed: firstEvent.seed ?? seed,
    runId: firstEvent.runId,
    nowMs: firstEvent.nowMs,
  };

  let state: RunState = gameReducer(null, startEvent, { scenario });

  for (let i = 1; i < events.length; i++) {
    const ev = events[i] as GameEvent;
    state = gameReducer(state, ev, { scenario });
  }

  return state;
}
