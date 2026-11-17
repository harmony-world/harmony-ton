export interface IndexerHealth {
  lastCycleAt: number | null;
  cycleCount: number;
  lastCycleFailures: number;
  lastCycleAddresses: number;
  startedAt: number | null;
}

let state: IndexerHealth = {
  lastCycleAt: null,
  cycleCount: 0,
  lastCycleFailures: 0,
  lastCycleAddresses: 0,
  startedAt: null,
};

export function markIndexerStarted(now = Date.now()): void {
  state = { ...state, startedAt: now };
}

export function markIndexerCycle(
  addresses: number,
  failures: number,
  now = Date.now(),
): void {
  state = {
    ...state,
    lastCycleAt: now,
    cycleCount: state.cycleCount + 1,
    lastCycleAddresses: addresses,
    lastCycleFailures: failures,
  };
}

export function getIndexerHealth(): IndexerHealth {
  return { ...state };
}

export function indexerStallMs(now = Date.now()): number | null {
  if (state.startedAt === null) return null;
  return now - (state.lastCycleAt ?? state.startedAt);
}

export function __resetIndexerHealth(): void {
  state = {
    lastCycleAt: null,
    cycleCount: 0,
    lastCycleFailures: 0,
    lastCycleAddresses: 0,
    startedAt: null,
  };
}
