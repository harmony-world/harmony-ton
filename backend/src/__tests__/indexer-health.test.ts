import { describe, it, expect, beforeEach } from "vitest";
import {
  __resetIndexerHealth,
  getIndexerHealth,
  indexerStallMs,
  markIndexerCycle,
  markIndexerStarted,
} from "../indexer/health.js";

beforeEach(() => {
  __resetIndexerHealth();
});

describe("indexer stall measurement", () => {
  it("reports nothing when the indexer was never started", () => {
    expect(indexerStallMs(1_000_000)).toBeNull();
  });

  it("measures from the start until the first cycle finishes", () => {
    markIndexerStarted(1_000);
    expect(indexerStallMs(61_000)).toBe(60_000);
    expect(getIndexerHealth().cycleCount).toBe(0);
  });

  it("measures from the last finished cycle once there is one", () => {
    markIndexerStarted(1_000);
    markIndexerCycle(3, 0, 50_000);
    expect(indexerStallMs(80_000)).toBe(30_000);
  });

  it("clears the stall as soon as a cycle completes", () => {
    markIndexerStarted(0);
    expect(indexerStallMs(900_000)).toBe(900_000);
    markIndexerCycle(3, 0, 900_000);
    expect(indexerStallMs(900_001)).toBe(1);
  });

  it("counts a cycle that finished even though every address failed", () => {
    markIndexerStarted(0);
    markIndexerCycle(4, 4, 10_000);
    expect(indexerStallMs(10_500)).toBe(500);
    expect(getIndexerHealth().lastCycleFailures).toBe(4);
    expect(getIndexerHealth().lastCycleAddresses).toBe(4);
  });

  it("keeps counting cycles across polls", () => {
    markIndexerStarted(0);
    markIndexerCycle(1, 0, 10);
    markIndexerCycle(1, 0, 20);
    expect(getIndexerHealth().cycleCount).toBe(2);
  });
});

describe("what the old alert got wrong", () => {
  it("is unaffected by how long a contract has been quiet", () => {
    markIndexerStarted(0);
    markIndexerCycle(26, 0, 1_000);

    const twoMonthsLater = 1_000 + 60 * 24 * 60 * 60 * 1000;
    markIndexerCycle(26, 0, twoMonthsLater);

    expect(indexerStallMs(twoMonthsLater + 5_000)).toBe(5_000);
  });
});
