import { describe, it, expect, vi, beforeEach } from "vitest";
import { parseOpCode, parseTransferNotificationBody, opToEventType, OP } from "../indexer/parser.js";
import { IndexerWorker } from "../indexer/worker.js";
import { Address, Cell, beginCell } from "@ton/core";

function bocWithOp(op: number): string {
  const cell = beginCell().storeUint(op, 32).endCell();
  return cell.toBoc().toString("base64");
}

const SUCCEEDED = { type: "ord", aborted: false, compute_ph: { skipped: false, success: true, exit_code: 0 } };
const REVERTED_DEADLINE_PASSED = {
  type: "ord",
  aborted: true,
  compute_ph: { skipped: false, success: false, exit_code: 109 },
};

function makeTx(op: number, overrides: Record<string, unknown> = {}) {
  return {
    hash: "deadbeef01",
    lt: "1000",
    account: "kQAbc",
    now: 1750000000,
    mc_block_seqno: 42,
    description: SUCCEEDED,
    in_msg: {
      body: bocWithOp(op),
      value: "500000000",
      source: "EQDonorAddress000000000000000000000000000000000",
    },
    ...overrides,
  };
}

const TEST_DONOR = Address.parse("EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c");

function transferNotificationBoc(amount: bigint, tipBps?: number): string {
  const builder = beginCell()
    .storeUint(OP.TransferNotification, 32)
    .storeUint(0, 64)
    .storeCoins(amount)
    .storeAddress(TEST_DONOR);

  if (tipBps === undefined) {
    builder.storeBit(false);
  } else {
    builder.storeBit(true).storeRef(
      beginCell()
        .storeUint(OP.Donate, 32)
        .storeUint(tipBps, 32)
        .endCell(),
    );
  }

  return builder.endCell().toBoc().toString("base64");
}

describe("parseOpCode", () => {
  it("parses Donate op correctly", () => {
    const boc = bocWithOp(OP.Donate);
    const result = parseOpCode(boc);
    expect(result).not.toBeNull();
    expect(result!.op).toBe(OP.Donate);
    expect(result!.opName).toBe("Donate");
  });

  it("parses Claim op correctly", () => {
    const result = parseOpCode(bocWithOp(OP.Claim));
    expect(result!.opName).toBe("Claim");
  });

  it("parses Freeze op correctly", () => {
    const result = parseOpCode(bocWithOp(OP.Freeze));
    expect(result!.opName).toBe("Freeze");
  });

  it("parses Unfreeze op correctly", () => {
    const result = parseOpCode(bocWithOp(OP.Unfreeze));
    expect(result!.opName).toBe("Unfreeze");
  });

  it("parses DeployCampaign op correctly", () => {
    const result = parseOpCode(bocWithOp(OP.DeployCampaign));
    expect(result!.opName).toBe("DeployCampaign");
  });

  it("parses TransferNotification op correctly", () => {
    const result = parseOpCode(transferNotificationBoc(1_150_000n, 1304));
    expect(result!.opName).toBe("TransferNotification");
  });

  it("returns unknown opName for unknown op", () => {
    const result = parseOpCode(bocWithOp(0xdeadbeef));
    expect(result!.op).toBe(0xdeadbeef);
    expect(result!.opName).toBe("unknown");
  });

  it("returns null for invalid base64", () => {
    expect(parseOpCode("not-valid-boc!!")).toBeNull();
  });

  it("returns null for empty cell (< 32 bits)", () => {
    const empty = Cell.EMPTY.toBoc().toString("base64");
    expect(parseOpCode(empty)).toBeNull();
  });
});

describe("parseTransferNotificationBody", () => {
  it("extracts USDT amount, sender, and Donate tipBps from forward_payload", () => {
    const result = parseTransferNotificationBody(transferNotificationBoc(1_150_000n, 1304));
    expect(result).toEqual({
      amount: 1_150_000n,
      sender: TEST_DONOR.toString(),
      tipBps: 1304,
    });
  });

  it("keeps tipBps null for empty forward_payload", () => {
    const result = parseTransferNotificationBody(transferNotificationBoc(1_150_000n));
    expect(result?.tipBps).toBeNull();
  });
});

describe("opToEventType", () => {
  it("maps Donate to DONATE", () => {
    expect(opToEventType(OP.Donate)).toBe("DONATE");
  });
  it("maps DeployCampaign to DEPLOY_CAMPAIGN", () => {
    expect(opToEventType(OP.DeployCampaign)).toBe("DEPLOY_CAMPAIGN");
  });
  it("maps TransferNotification to TRANSFER_NOTIFICATION", () => {
    expect(opToEventType(OP.TransferNotification)).toBe("TRANSFER_NOTIFICATION");
  });
  it("returns null for unknown op", () => {
    expect(opToEventType(0xffffffff)).toBeNull();
  });
  it("maps the gas-return opcodes instead of dropping them", () => {
    expect(opToEventType(OP.CampaignGasReturn)).toBe("CAMPAIGN_GAS_RETURN");
    expect(opToEventType(OP.RefillDeployer)).toBe("REFILL_DEPLOYER");
    expect(opToEventType(OP.SetCampaignCode)).toBe("SET_CAMPAIGN_CODE");
    expect(opToEventType(OP.SetDeployerWallet)).toBe("SET_DEPLOYER_WALLET");
  });
});

function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    indexerCursor: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([]),
    },
    onchainEvent: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 1n }),
    },
    campaign: {
      findUnique: vi.fn().mockResolvedValue({ id: "camp-0001" }),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    donation: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
    },
    withdrawal: {
      upsert: vi.fn().mockResolvedValue({}),
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
          create: vi.fn().mockResolvedValue({}),
        },
        withdrawal: {
          upsert: vi.fn().mockResolvedValue({}),
        },
        user: {
          findFirst: vi.fn().mockResolvedValue(null),
          update: vi.fn().mockResolvedValue({}),
        },
      });
    }),
    $disconnect: vi.fn(),
    ...overrides,
  };
}

function makeWorker(prisma: ReturnType<typeof makePrisma>) {
  const mockClient = {
    getTransactions: vi.fn().mockResolvedValue([]),
    runGetMethod: vi.fn(),
  };

  const worker = new IndexerWorker(
    prisma as never,
    { contracts: ["kQAbc"], pollIntervalMs: 60_000, testnet: true },
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (worker as any)["client"] = mockClient;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (worker as any).verifyCampaignMaster = vi.fn().mockResolvedValue(true);

  return { worker, mockClient };
}

describe("IndexerWorker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("skips polling when no transactions returned", async () => {
    const prisma = makePrisma();
    const { worker, mockClient } = makeWorker(prisma);
    mockClient.getTransactions.mockResolvedValue([]);

    await worker.pollContract("kQAbc");

    expect(prisma.indexerCursor.upsert).not.toHaveBeenCalled();
  });

  it("passes start_lt from cursor when cursor exists", async () => {
    const prisma = makePrisma({
      indexerCursor: {
        findUnique: vi.fn().mockResolvedValue({ lastLt: 500n, lastTxHash: "abc" }),
        upsert: vi.fn().mockResolvedValue({}),
      },
    });
    const { worker, mockClient } = makeWorker(prisma);
    mockClient.getTransactions.mockResolvedValue([]);

    await worker.pollContract("kQAbc");

    expect(mockClient.getTransactions).toHaveBeenCalledWith("kQAbc", { startLt: 500n, limit: 100 });
  });

  it("does not reprocess inclusive boundary tx from cursor", async () => {
    const prisma = makePrisma({
      indexerCursor: {
        findUnique: vi.fn().mockResolvedValue({ lastLt: 500n, lastTxHash: "abc" }),
        upsert: vi.fn().mockResolvedValue({}),
      },
    });
    const { worker, mockClient } = makeWorker(prisma);
    mockClient.getTransactions.mockResolvedValue([
      makeTx(OP.Donate, { hash: "abc", lt: "500" }),
    ]);

    await worker.pollContract("kQAbc");

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.indexerCursor.upsert).not.toHaveBeenCalled();
  });

  it("advances cursor to last tx lt after processing", async () => {
    const prisma = makePrisma();
    const { worker, mockClient } = makeWorker(prisma);

    mockClient.getTransactions.mockResolvedValue([
      makeTx(OP.Donate, { hash: "tx01", lt: "2000" }),
      makeTx(OP.Donate, { hash: "tx02", lt: "2001" }),
    ]);

    await worker.pollContract("kQAbc");

    expect(prisma.indexerCursor.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ lastLt: 2001n, lastTxHash: "tx02" }),
      })
    );
  });

  it("skips tx with no in_msg body", async () => {
    const prisma = makePrisma();
    const { worker, mockClient } = makeWorker(prisma);

    mockClient.getTransactions.mockResolvedValue([
      { hash: "tx01", lt: "1000", account: "kQAbc", now: 1750000000, mc_block_seqno: 1, in_msg: null },
    ]);

    await worker.pollContract("kQAbc");

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("skips duplicate tx (already in onchain_events)", async () => {
    const prisma = makePrisma({
      onchainEvent: {
        findUnique: vi.fn().mockResolvedValue({ id: 1n }),
        create: vi.fn(),
      },
    });
    const { worker, mockClient } = makeWorker(prisma);

    mockClient.getTransactions.mockResolvedValue([makeTx(OP.Donate)]);

    await worker.pollContract("kQAbc");

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("stop() prevents further polling", async () => {
    const prisma = makePrisma();
    const { worker, mockClient } = makeWorker(prisma);
    mockClient.getTransactions.mockResolvedValue([]);

    worker.stop();
    expect((worker as never)["timer"]).toBeNull();
  });

  it("starts recovery polling without waiting for the streaming connection to close", async () => {
    const prisma = makePrisma();
    const worker = new IndexerWorker(
      prisma as never,
      {
        contracts: ["kQAbc"],
        pollIntervalMs: 60_000,
        testnet: true,
        streamingEnabled: true,
        streamingApiKey: "test-key",
      },
    );
    const subscribe = vi.fn().mockReturnValue(new Promise(() => {}));
    (worker as unknown as { streamingClient: { subscribe: typeof subscribe; connected: boolean; stop: () => void } })
      .streamingClient = {
        subscribe,
        connected: true,
        stop: vi.fn(),
      };
    const pollContract = vi.spyOn(worker, "pollContract").mockResolvedValue();

    await worker.start();
    worker.stop();

    expect(subscribe).toHaveBeenCalledWith(["kQAbc"]);
    expect(pollContract).toHaveBeenCalledWith("kQAbc");
  });

  it("adds campaign address to watchSet when DeployCampaign out_msg is present", async () => {
    const prisma = makePrisma();
    const { worker, mockClient } = makeWorker(prisma);

    const newCampaignAddr = "kQBNewCampaignAddr0000000000000000000000000000001";
    mockClient.getTransactions.mockResolvedValue([
      makeTx(OP.DeployCampaign, {
        hash: "deploy01",
        lt: "3000",
        out_msgs: [{ destination: newCampaignAddr, value: "50000000" }],
      }),
    ]);

    await worker.pollContract("kQAbc");

    expect(worker.hasContract(newCampaignAddr)).toBe(true);
  });

  it("persists new campaign address to IndexerCursor on discovery", async () => {
    const prisma = makePrisma();
    const { worker, mockClient } = makeWorker(prisma);

    const newCampaignAddr = "kQBNewCampaignAddr0000000000000000000000000000002";
    mockClient.getTransactions.mockResolvedValue([
      makeTx(OP.DeployCampaign, {
        hash: "deploy02",
        lt: "3001",
        out_msgs: [{ destination: newCampaignAddr }],
      }),
    ]);

    await worker.pollContract("kQAbc");

    expect(prisma.indexerCursor.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { contractAddr: newCampaignAddr },
        create: { contractAddr: newCampaignAddr },
      })
    );
  });

  it("adds campaign address when master verification is temporarily unavailable", async () => {
    const prisma = makePrisma();
    const { worker, mockClient } = makeWorker(prisma);

    const newCampaignAddr = "kQBNewCampaignAddr0000000000000000000000000000004";
    (worker as unknown as { verifyCampaignMaster: ReturnType<typeof vi.fn> }).verifyCampaignMaster =
      vi.fn().mockResolvedValue(null);
    mockClient.getTransactions.mockResolvedValue([
      makeTx(OP.DeployCampaign, {
        hash: "deploy-unavailable",
        lt: "3003",
        out_msgs: [{ destination: newCampaignAddr }],
      }),
    ]);

    await worker.pollContract("kQAbc");

    expect(worker.hasContract(newCampaignAddr)).toBe(true);
  });

  it("does not add campaign address when master verification returns mismatch", async () => {
    const prisma = makePrisma();
    const { worker, mockClient } = makeWorker(prisma);

    const newCampaignAddr = "kQBNewCampaignAddr0000000000000000000000000000005";
    (worker as unknown as { verifyCampaignMaster: ReturnType<typeof vi.fn> }).verifyCampaignMaster =
      vi.fn().mockResolvedValue(false);
    mockClient.getTransactions.mockResolvedValue([
      makeTx(OP.DeployCampaign, {
        hash: "deploy-mismatch",
        lt: "3004",
        out_msgs: [{ destination: newCampaignAddr }],
      }),
    ]);

    await worker.pollContract("kQAbc");

    expect(worker.hasContract(newCampaignAddr)).toBe(false);
  });

  it("does not add duplicate address when DeployCampaign fires twice", async () => {
    const prisma = makePrisma();
    const { worker, mockClient } = makeWorker(prisma);

    const newCampaignAddr = "kQBNewCampaignAddr0000000000000000000000000000003";
    const deployTx = makeTx(OP.DeployCampaign, {
      out_msgs: [{ destination: newCampaignAddr }],
    });
    mockClient.getTransactions.mockResolvedValue([deployTx]);

    await worker.addCampaign(newCampaignAddr);
    const upsertCallsAfterFirst = prisma.indexerCursor.upsert.mock.calls.length;

    await worker.addCampaign(newCampaignAddr);
    expect(prisma.indexerCursor.upsert.mock.calls.length).toBe(upsertCallsAfterFirst);
  });

  it("increments raisedAmountUsd on Donate event", async () => {
    let capturedUpdate: ReturnType<typeof vi.fn> | undefined;
    const prisma = makePrisma({
      $transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
        const campaignUpdate = vi.fn().mockResolvedValue({});
        capturedUpdate = campaignUpdate;
        await fn({
          onchainEvent: { create: vi.fn().mockResolvedValue({}) },
          campaign: {
            findUnique: vi.fn().mockResolvedValue({ id: "camp-0001" }),
            update: campaignUpdate,
          },
          donation: {
            findUnique: vi.fn().mockResolvedValue(null),
            create: vi.fn().mockResolvedValue({}),
          },
          user: {
            findFirst: vi.fn().mockResolvedValue(null),
            update: vi.fn().mockResolvedValue({}),
          },
        });
      }),
    });
    const { worker, mockClient } = makeWorker(prisma);
    mockClient.getTransactions.mockResolvedValue([
      makeTx(OP.Donate, { hash: "tx-usd-01", lt: "5000" }),
    ]);

    await worker.pollContract("kQAbc");

    expect(capturedUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          raisedAmountUsd: expect.objectContaining({ increment: expect.any(Number) }),
        }),
      })
    );
  });

  it("links Donate event to user by wallet and updates user aggregates", async () => {
    let capturedDonationCreate: ReturnType<typeof vi.fn> | undefined;
    let capturedUserUpdate: ReturnType<typeof vi.fn> | undefined;
    const prisma = makePrisma({
      $transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
        const donationCreate = vi.fn().mockResolvedValue({});
        const userUpdate = vi.fn().mockResolvedValue({});
        capturedDonationCreate = donationCreate;
        capturedUserUpdate = userUpdate;
        await fn({
          onchainEvent: { create: vi.fn().mockResolvedValue({}) },
          campaign: {
            findUnique: vi.fn().mockResolvedValue({ id: "camp-0001" }),
            update: vi.fn().mockResolvedValue({}),
          },
          donation: {
            findUnique: vi.fn().mockResolvedValue(null),
            create: donationCreate,
          },
          user: {
            findFirst: vi.fn().mockResolvedValue({
              id: "user-001",
              tgUserId: BigInt(123456789),
              totalDonatedUsd: 49,
            }),
            update: userUpdate,
          },
        });
      }),
    });
    const { worker, mockClient } = makeWorker(prisma);
    mockClient.getTransactions.mockResolvedValue([
      makeTx(OP.Donate, { hash: "tx-user-01", lt: "5100" }),
    ]);

    await worker.pollContract("kQAbc");

    expect(capturedDonationCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          donorId: "user-001",
          donorTgUserId: BigInt(123456789),
        }),
      })
    );
    expect(capturedUserUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "user-001" },
        data: expect.objectContaining({
          totalDonatedUsd: expect.objectContaining({ increment: expect.any(Number) }),
          donationCount: { increment: 1 },
          donorStatus: "sprout",
        }),
      })
    );
  });

  it("does not count private campaign donations in user profile aggregates", async () => {
    let capturedDonationCreate: ReturnType<typeof vi.fn> | undefined;
    let capturedUserUpdate: ReturnType<typeof vi.fn> | undefined;
    const prisma = makePrisma({
      $transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
        const donationCreate = vi.fn().mockResolvedValue({});
        const userUpdate = vi.fn().mockResolvedValue({});
        capturedDonationCreate = donationCreate;
        capturedUserUpdate = userUpdate;
        await fn({
          onchainEvent: { create: vi.fn().mockResolvedValue({}) },
          campaign: {
            findUnique: vi.fn().mockResolvedValue({ id: "camp-private", isPublic: false }),
            update: vi.fn().mockResolvedValue({}),
          },
          donation: {
            findUnique: vi.fn().mockResolvedValue(null),
            create: donationCreate,
          },
          user: {
            findFirst: vi.fn().mockResolvedValue({
              id: "user-001",
              tgUserId: BigInt(123456789),
              totalDonatedUsd: 49,
            }),
            update: userUpdate,
          },
        });
      }),
    });
    const { worker, mockClient } = makeWorker(prisma);
    mockClient.getTransactions.mockResolvedValue([
      makeTx(OP.Donate, { hash: "tx-private-01", lt: "5101" }),
    ]);

    await worker.pollContract("kQAbc");

    expect(capturedDonationCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          campaignId: "camp-private",
          donorId: "user-001",
          donorTgUserId: BigInt(123456789),
        }),
      })
    );
    expect(capturedUserUpdate).not.toHaveBeenCalled();
  });

  it("applies matching donation intent metadata to indexed donation", async () => {
    let capturedDonationCreate: ReturnType<typeof vi.fn> | undefined;
    let capturedIntentUpdate: ReturnType<typeof vi.fn> | undefined;
    const prisma = makePrisma({
      $transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
        const donationCreate = vi.fn().mockResolvedValue({});
        const intentUpdate = vi.fn().mockResolvedValue({});
        capturedDonationCreate = donationCreate;
        capturedIntentUpdate = intentUpdate;
        await fn({
          onchainEvent: { create: vi.fn().mockResolvedValue({}) },
          campaign: {
            findUnique: vi.fn().mockResolvedValue({ id: "camp-0001" }),
            update: vi.fn().mockResolvedValue({}),
          },
          donation: {
            findUnique: vi.fn().mockResolvedValue(null),
            create: donationCreate,
          },
          donationIntent: {
            findFirst: vi.fn().mockResolvedValue({
              id: "intent-001",
              donorName: "Мария",
              isAnonymous: false,
            }),
            update: intentUpdate,
          },
          user: {
            findFirst: vi.fn().mockResolvedValue(null),
            update: vi.fn().mockResolvedValue({}),
          },
        });
      }),
    });
    const { worker, mockClient } = makeWorker(prisma);
    mockClient.getTransactions.mockResolvedValue([
      makeTx(OP.Donate, { hash: "tx-intent-01", lt: "5200" }),
    ]);

    await worker.pollContract("kQAbc");

    expect(capturedDonationCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          isAnonymous: false,
          message: "Мария",
        }),
      })
    );
    expect(capturedIntentUpdate).toHaveBeenCalledWith({
      where: { id: "intent-001" },
      data: { matchedAt: new Date(1750000000 * 1000) },
    });
  });

  it("indexes USDT TransferNotification with net donation and tip from forward_payload", async () => {
    let capturedDonationCreate: ReturnType<typeof vi.fn> | undefined;
    let capturedCampaignUpdate: ReturnType<typeof vi.fn> | undefined;
    const prisma = makePrisma({
      $transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
        const donationCreate = vi.fn().mockResolvedValue({});
        const campaignUpdate = vi.fn().mockResolvedValue({
          id: "camp-0001",
          raisedAmountUsd: 1,
          goalAmountUsd: 100,
          status: "active",
        });
        capturedDonationCreate = donationCreate;
        capturedCampaignUpdate = campaignUpdate;
        await fn({
          onchainEvent: { create: vi.fn().mockResolvedValue({}) },
          campaign: {
            findUnique: vi.fn().mockResolvedValue({ id: "camp-0001" }),
            update: campaignUpdate,
          },
          donation: {
            findUnique: vi.fn().mockResolvedValue(null),
            create: donationCreate,
          },
          user: {
            findFirst: vi.fn().mockResolvedValue(null),
            update: vi.fn().mockResolvedValue({}),
          },
        });
      }),
    });
    const { worker, mockClient } = makeWorker(prisma);
    mockClient.getTransactions.mockResolvedValue([
      makeTx(OP.TransferNotification, {
        hash: "tx-usdt-tip-01",
        lt: "5250",
        in_msg: {
          body: transferNotificationBoc(1_150_000n, 1304),
          value: "100000000",
          source: "EQJettonWallet000000000000000000000000000000000",
        },
      }),
    ]);

    await worker.pollContract("kQAbc");

    expect(capturedDonationCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          amountToken: 1.00004,
          tipAmountToken: 0.14996,
          token: "USDT",
        }),
      }),
    );
    expect(capturedCampaignUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          raisedAmountToken: { increment: 1.00004 },
          raisedAmountUsd: { increment: 1.00004 },
        }),
      }),
    );
  });

  it("does not increment campaign or user when donation already exists", async () => {
    let capturedCampaignUpdate: ReturnType<typeof vi.fn> | undefined;
    let capturedUserUpdate: ReturnType<typeof vi.fn> | undefined;
    const prisma = makePrisma({
      $transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
        const campaignUpdate = vi.fn().mockResolvedValue({});
        const userUpdate = vi.fn().mockResolvedValue({});
        capturedCampaignUpdate = campaignUpdate;
        capturedUserUpdate = userUpdate;
        await fn({
          onchainEvent: { create: vi.fn().mockResolvedValue({}) },
          campaign: {
            findUnique: vi.fn().mockResolvedValue({ id: "camp-0001" }),
            update: campaignUpdate,
          },
          donation: {
            findUnique: vi.fn().mockResolvedValue({ id: "don-existing" }),
            create: vi.fn(),
          },
          user: {
            findFirst: vi.fn(),
            update: userUpdate,
          },
        });
      }),
    });
    const { worker, mockClient } = makeWorker(prisma);
    mockClient.getTransactions.mockResolvedValue([
      makeTx(OP.Donate, { hash: "tx-existing", lt: "5200" }),
    ]);

    await worker.pollContract("kQAbc");

    expect(capturedCampaignUpdate).not.toHaveBeenCalled();
    expect(capturedUserUpdate).not.toHaveBeenCalled();
  });

  describe("reverted transactions", () => {
    function makeRevertCatcher() {
      const donationCreate = vi.fn().mockResolvedValue({});
      const campaignUpdate = vi.fn().mockResolvedValue({});
      const eventCreate = vi.fn().mockResolvedValue({});
      const prisma = makePrisma({
        $transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
          await fn({
            onchainEvent: { create: eventCreate },
            campaign: {
              findUnique: vi.fn().mockResolvedValue({ id: "camp-0001", isPublic: true }),
              update: campaignUpdate,
            },
            donation: { findUnique: vi.fn().mockResolvedValue(null), create: donationCreate },
            donationIntent: { findFirst: vi.fn().mockResolvedValue(null), update: vi.fn() },
            user: { findFirst: vi.fn().mockResolvedValue(null), findUnique: vi.fn(), update: vi.fn() },
          });
        }),
      });
      return { prisma, donationCreate, campaignUpdate, eventCreate };
    }

    it("records no GRAM donation for a reverted Donate", async () => {
      const { prisma, donationCreate, campaignUpdate, eventCreate } = makeRevertCatcher();
      const { worker, mockClient } = makeWorker(prisma);
      mockClient.getTransactions.mockResolvedValue([
        makeTx(OP.Donate, { hash: "tx-reverted-gram", lt: "6000", description: REVERTED_DEADLINE_PASSED }),
      ]);

      await worker.pollContract("kQAbc");

      expect(donationCreate).not.toHaveBeenCalled();
      expect(campaignUpdate).not.toHaveBeenCalled();
      expect(eventCreate).toHaveBeenCalled();
    });

    it("records no USDT donation for a reverted TransferNotification", async () => {
      const { prisma, donationCreate, campaignUpdate } = makeRevertCatcher();
      const { worker, mockClient } = makeWorker(prisma);
      mockClient.getTransactions.mockResolvedValue([
        makeTx(OP.TransferNotification, {
          hash: "tx-reverted-usdt",
          lt: "6001",
          description: REVERTED_DEADLINE_PASSED,
          in_msg: {
            body: transferNotificationBoc(1_000_000n),
            value: "50000000",
            source: "EQJettonWallet000000000000000000000000000000000",
          },
        }),
      ]);

      await worker.pollContract("kQAbc");

      expect(donationCreate).not.toHaveBeenCalled();
      expect(campaignUpdate).not.toHaveBeenCalled();
    });

    it("persists nothing when the payload does not say how the transaction ended", async () => {
      const { prisma, donationCreate, eventCreate } = makeRevertCatcher();
      const { worker, mockClient } = makeWorker(prisma);
      const tx = makeTx(OP.Donate, { hash: "tx-no-outcome", lt: "6002" }) as Record<string, unknown>;
      delete tx.description;
      mockClient.getTransactions.mockResolvedValue([tx]);

      await worker.pollContract("kQAbc");

      expect(donationCreate).not.toHaveBeenCalled();
      expect(eventCreate).not.toHaveBeenCalled();
    });
  });

  it("upserts confirmed withdrawal on Claim event", async () => {
    let capturedWithdrawalUpsert: ReturnType<typeof vi.fn> | undefined;
    let capturedCampaignUpdate: ReturnType<typeof vi.fn> | undefined;
    const prisma = makePrisma({
      $transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
        const withdrawalUpsert = vi.fn().mockResolvedValue({});
        const campaignUpdate = vi.fn().mockResolvedValue({});
        capturedWithdrawalUpsert = withdrawalUpsert;
        capturedCampaignUpdate = campaignUpdate;
        await fn({
          onchainEvent: { create: vi.fn().mockResolvedValue({}) },
          campaign: {
            findUnique: vi.fn().mockResolvedValue({
              id: "camp-0001",
              creatorId: "creator-001",
              payoutAddress: "EQPayoutAddress000000000000000000000000000000000",
              raisedAmountToken: "2.5",
              raisedAmountUsd: "10.99",
              goalToken: "GRAM",
            }),
            update: campaignUpdate,
          },
          donation: {
            findUnique: vi.fn().mockResolvedValue(null),
            create: vi.fn().mockResolvedValue({}),
          },
          withdrawal: {
            upsert: withdrawalUpsert,
          },
          user: {
            findFirst: vi.fn().mockResolvedValue({ id: "recipient-001" }),
            update: vi.fn().mockResolvedValue({}),
          },
        });
      }),
    });
    const { worker, mockClient } = makeWorker(prisma);
    mockClient.getTransactions.mockResolvedValue([
      makeTx(OP.Claim, { hash: "claim-tx-001", lt: "5300", now: 1782568556 }),
    ]);

    await worker.pollContract("kQAbc");

    expect(capturedWithdrawalUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { txHash: "claim-tx-001" },
        create: expect.objectContaining({
          campaignId: "camp-0001",
          recipientId: "recipient-001",
          amountToken: "2.5",
          amountUsd: "10.99",
          token: "GRAM",
          destinationAddr: "EQPayoutAddress000000000000000000000000000000000",
          txHash: "claim-tx-001",
          status: "confirmed",
          confirmedAt: new Date("2026-06-27T13:55:56.000Z"),
        }),
      })
    );
    expect(capturedCampaignUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "camp-0001" },
        data: { completedAt: new Date("2026-06-27T13:55:56.000Z") },
      })
    );
  });

  it("ignores DeployCampaign with no out_msgs", async () => {
    const prisma = makePrisma();
    const { worker, mockClient } = makeWorker(prisma);

    mockClient.getTransactions.mockResolvedValue([
      makeTx(OP.DeployCampaign, { hash: "deploy03", lt: "3002" }),
    ]);

    await worker.pollContract("kQAbc");

    expect(worker.hasContract("kQAbc")).toBe(true);
    const campaignUpserts = prisma.indexerCursor.upsert.mock.calls.filter(
      (call) => call[0].where.contractAddr !== "kQAbc"
    );
    expect(campaignUpserts).toHaveLength(0);
  });

  it("loads previously-known addresses from DB on start", async () => {
    const storedAddr = "kQBStoredCampaignFromDB00000000000000000000000001";
    const prisma = makePrisma({
      indexerCursor: {
        findUnique: vi.fn().mockResolvedValue(null),
        upsert: vi.fn().mockResolvedValue({}),
        findMany: vi.fn().mockResolvedValue([
          { contractAddr: storedAddr },
        ]),
      },
    });
    const { worker, mockClient } = makeWorker(prisma);
    mockClient.getTransactions.mockResolvedValue([]);

    await worker.start();
    worker.stop();

    expect(worker.hasContract(storedAddr)).toBe(true);
  });

  it("loads deployed campaign addresses from DB on start", async () => {
    const deployedAddr = "kQBDeployedCampaignFromDB000000000000000000000001";
    const prisma = makePrisma({
      campaign: {
        findUnique: vi.fn().mockResolvedValue({ id: "camp-0001" }),
        findMany: vi.fn().mockResolvedValue([{ onchainAddress: deployedAddr }]),
        update: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    });
    const { worker, mockClient } = makeWorker(prisma);
    mockClient.getTransactions.mockResolvedValue([]);

    await worker.start();
    worker.stop();

    expect(worker.hasContract(deployedAddr)).toBe(true);
  });
});
