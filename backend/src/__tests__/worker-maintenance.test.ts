import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { reconcileOnchain } from "../indexer/worker-maintenance.js";

const DEADLINE_UNIX = 1798761600;

function statusStack(overrides: Partial<Record<number, string>> = {}) {
  const values = ["0x0", "0x0", "0x0", "0x0", `0x${DEADLINE_UNIX.toString(16)}`, "0x0", "0x0", "0x0"];
  for (const [i, v] of Object.entries(overrides)) values[Number(i)] = v as string;
  return values.map((value) => ({ type: "num", value }));
}

function makeInput(campaign: Record<string, unknown>) {
  const mockUpdate = vi.fn().mockResolvedValue({});
  const prisma = {
    campaign: {
      findMany: vi.fn().mockResolvedValue([campaign]),
      update: mockUpdate,
    },
    donation: {
      aggregate: vi.fn().mockResolvedValue({ _sum: { amountToken: 0 } }),
    },
  };
  const client = {
    runGetMethod: vi.fn().mockResolvedValue({ exit_code: 0, stack: statusStack() }),
  };
  const log = { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() };
  return { prisma, client, log, mockUpdate };
}

const deployedCampaign = {
  id: "camp-0001",
  onchainAddress: "EQDeployed",
  raisedAmountToken: 0,
  raisedAmountUsd: 0,
  donorCount: 0,
  status: "active",
  onchainDeadline: null,
  onchainDriftAt: null,
};

describe("reconcileOnchain — on-chain deadline backfill", () => {
  it("fills a missing on-chain deadline from get_status", async () => {
    const { prisma, client, log, mockUpdate } = makeInput(deployedCampaign);

    await reconcileOnchain({ prisma, client, log } as never);

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "camp-0001" },
      data: { onchainDeadline: new Date(DEADLINE_UNIX * 1000) },
    });
  });

  it("never overwrites a deadline already recorded", async () => {
    const recorded = new Date("2026-09-22T00:00:00.000Z");
    const { prisma, client, log, mockUpdate } = makeInput({
      ...deployedCampaign,
      onchainDeadline: recorded,
    });

    await reconcileOnchain({ prisma, client, log } as never);

    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

describe("reconcileOnchain — drift mark", () => {
  const recordedDeadline = new Date(DEADLINE_UNIX * 1000);

  it("marks the campaign when the contract and the database disagree", async () => {
    const { prisma, client, log, mockUpdate } = makeInput({
      ...deployedCampaign,
      onchainDeadline: recordedDeadline,
      donorCount: 2,
    });

    await reconcileOnchain({ prisma, client, log } as never);

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "camp-0001" },
      data: {
        onchainDriftAt: expect.any(Date),
        onchainDriftDetail: {
          db: { raisedTon: 0, raisedUsdt: 0, donorCount: 2 },
          onchain: { raisedTon: 0, raisedUsdt: 0, donorCount: 0 },
          diff: { raisedTon: 0, raisedUsdt: 0, donorCount: 2 },
        },
      },
    });
  });

  it("clears a mark once the numbers agree again", async () => {
    const { prisma, client, log, mockUpdate } = makeInput({
      ...deployedCampaign,
      onchainDeadline: recordedDeadline,
      onchainDriftAt: new Date("2026-09-22T09:00:00.000Z"),
    });

    await reconcileOnchain({ prisma, client, log } as never);

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "camp-0001" },
      data: { onchainDriftAt: null, onchainDriftDetail: Prisma.DbNull },
    });
  });

  it("leaves an unmarked, agreeing campaign alone", async () => {
    const { prisma, client, log, mockUpdate } = makeInput({
      ...deployedCampaign,
      onchainDeadline: recordedDeadline,
    });

    await reconcileOnchain({ prisma, client, log } as never);

    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
