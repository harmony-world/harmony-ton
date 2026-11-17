import { describe, it, expect, vi, beforeEach } from "vitest";
import { beginCell } from "@ton/core";
import { IndexerWorker } from "../indexer/worker.js";
import { OP } from "../indexer/parser.js";

vi.mock("../services/price.js", () => ({
  getTonPrice: vi.fn().mockReturnValue(5.0),
  startPricePolling: vi.fn(),
  stopPricePolling: vi.fn(),
  fetchTonPriceNow: vi.fn(),
  _resetForTest: vi.fn(),
}));

import { getTonPrice } from "../services/price.js";

function bocWithOp(op: number): string {
  return beginCell().storeUint(op, 32).endCell().toBoc().toString("base64");
}

function makeTx(op: number, valueNano = "2000000000") {
  return {
    hash: "aabbcc01",
    lt: "3000",
    account: "kQAbc",
    now: 1750000000,
    mc_block_seqno: 99,
    description: { type: "ord", aborted: false, compute_ph: { skipped: false, success: true, exit_code: 0 } },
    in_msg: {
      body: bocWithOp(op),
      value: valueNano,
      source: "EQDonorAddress000000000000000000000000000000000",
    },
  };
}

function makePrisma(donationCreateMock: ReturnType<typeof vi.fn>) {
  return {
    indexerCursor: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({}),
    },
    onchainEvent: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
    },
    campaign: {
      findUnique: vi.fn().mockResolvedValue({ id: "camp-0001" }),
      update: vi.fn().mockResolvedValue({}),
    },
    donation: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: donationCreateMock,
    },
    user: {
      findFirst: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
    },
    $transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
      await fn({
        onchainEvent: { create: vi.fn().mockResolvedValue({}) },
        campaign: {
          findUnique: vi.fn().mockResolvedValue({ id: "camp-0001" }),
          update: vi.fn().mockResolvedValue({}),
        },
        donation: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: donationCreateMock,
        },
        user: {
          findFirst: vi.fn().mockResolvedValue(null),
          update: vi.fn().mockResolvedValue({}),
        },
      });
    }),
  };
}

describe("IndexerWorker × price service", () => {
  beforeEach(() => vi.clearAllMocks());

  it("computes amountUsd = amountTon × getTonPrice() for Donate events", async () => {
    vi.mocked(getTonPrice).mockReturnValue(5.0);
    const donationCreate = vi.fn().mockResolvedValue({});
    const prisma = makePrisma(donationCreate);

    const worker = new IndexerWorker(prisma as never, {
      contracts: ["kQAbc"],
      pollIntervalMs: 60_000,
      testnet: true,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
(worker as any)["client"] = {
      getTransactions: vi.fn().mockResolvedValue([makeTx(OP.Donate, "2000000000")]),
    };

    await worker.pollContract("kQAbc");

    expect(donationCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ amountUsd: 10.0 }),
      })
    );
  });

  it("sets amountUsd = 0 when price is unavailable", async () => {
    vi.mocked(getTonPrice).mockReturnValue(0);
    const donationCreate = vi.fn().mockResolvedValue({});
    const prisma = makePrisma(donationCreate);

    const worker = new IndexerWorker(prisma as never, {
      contracts: ["kQAbc"],
      pollIntervalMs: 60_000,
      testnet: true,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
(worker as any)["client"] = {
      getTransactions: vi.fn().mockResolvedValue([makeTx(OP.Donate, "1000000000")]),
    };

    await worker.pollContract("kQAbc");

    expect(donationCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ amountUsd: 0 }),
      })
    );
  });

  it("does not block donation recording when price is 0", async () => {
    vi.mocked(getTonPrice).mockReturnValue(0);
    const donationCreate = vi.fn().mockResolvedValue({});
    const prisma = makePrisma(donationCreate);

    const worker = new IndexerWorker(prisma as never, {
      contracts: ["kQAbc"],
      pollIntervalMs: 60_000,
      testnet: true,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
(worker as any)["client"] = {
      getTransactions: vi.fn().mockResolvedValue([makeTx(OP.Donate)]),
    };

    await worker.pollContract("kQAbc");

    expect(donationCreate).toHaveBeenCalledOnce();
  });
});
