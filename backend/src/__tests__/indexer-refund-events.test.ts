import { describe, it, expect, vi } from "vitest";
import { handleRefundEvent } from "../indexer/handlers.js";
import { OP, opToEventType } from "../indexer/parser.js";
import type { TonTransaction } from "../indexer/ton-api.js";

const CAMPAIGN = "kQCampaignAddress";
const MASTER = "kQMasterAddress";

function makeTx(over: Partial<TonTransaction["in_msg"]> = {}): TonTransaction {
  return {
    hash: "tx01",
    lt: "1000",
    account: MASTER,
    now: 1_750_000_000,
    mc_block_seqno: 1,
    in_msg: { body: "", value: "0", source: CAMPAIGN, ...over },
  } as TonTransaction;
}

function makeClient(campaign: { id: string; status: string } | null, donations: { id: string; donorId: string | null }[] = []) {
  return {
    campaign: {
      findUnique: vi.fn().mockResolvedValue(campaign),
      update: vi.fn().mockResolvedValue({}),
    },
    donation: {
      findMany: vi.fn().mockResolvedValue(donations),
      updateMany: vi.fn().mockResolvedValue({ count: donations.length }),
      aggregate: vi.fn().mockResolvedValue({ _sum: { amountUsd: 0 }, _count: { _all: 0 } }),
    },
    user: {
      update: vi.fn().mockResolvedValue({}),
    },
  };
}

const deps = {
  prisma: {} as never,
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as never,
  testnet: true,
  toFriendly: (addr: string) => addr,
};

describe("refund events reach the indexer at all", () => {
  it("gives both opcodes an event type, or polling drops them before dispatch", () => {
    expect(opToEventType(OP.RefundBatch)).toBe("REFUND_BATCH");
    expect(opToEventType(OP.CampaignRefunded)).toBe("CAMPAIGN_REFUNDED");
  });
});

describe("handleRefundEvent — RefundBatch", () => {
  it("marks the campaign as refunding", async () => {
    const tx = makeClient({ id: "camp-1", status: "frozen" });
    await handleRefundEvent(tx as never, deps, CAMPAIGN, OP.RefundBatch, makeTx());

    expect(tx.campaign.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { onchainAddress: CAMPAIGN } }),
    );
    expect(tx.campaign.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "refunding" } }),
    );
  });

  it("does not re-open a campaign that already finished refunding", async () => {
    const tx = makeClient({ id: "camp-1", status: "refunded" });
    await handleRefundEvent(tx as never, deps, CAMPAIGN, OP.RefundBatch, makeTx());

    expect(tx.campaign.update).not.toHaveBeenCalled();
  });
});

describe("handleRefundEvent — CampaignRefunded", () => {
  it("finds the campaign by the message sender, not by the contract polled", async () => {
    const tx = makeClient({ id: "camp-1", status: "refunding" });
    await handleRefundEvent(tx as never, deps, MASTER, OP.CampaignRefunded, makeTx());

    expect(tx.campaign.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { onchainAddress: CAMPAIGN } }),
    );
    expect(tx.campaign.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "refunded" } }),
    );
  });

  it("releases the donations and recomputes the stats of each distinct donor", async () => {
    const tx = makeClient({ id: "camp-1", status: "refunding" }, [
      { id: "d1", donorId: "user-a" },
      { id: "d2", donorId: "user-a" },
      { id: "d3", donorId: "user-b" },
      { id: "d4", donorId: null },
    ]);
    await handleRefundEvent(tx as never, deps, MASTER, OP.CampaignRefunded, makeTx());

    expect(tx.donation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "refunded" } }),
    );
    expect(tx.user.update).toHaveBeenCalledTimes(2);
  });

  it("ignores a message from an address it does not know", async () => {
    const tx = makeClient(null);
    await handleRefundEvent(tx as never, deps, MASTER, OP.CampaignRefunded, makeTx({ source: "kQStranger" }));

    expect(tx.campaign.update).not.toHaveBeenCalled();
    expect(tx.donation.updateMany).not.toHaveBeenCalled();
  });

  it("ignores a message with no sender", async () => {
    const tx = makeClient({ id: "camp-1", status: "refunding" });
    await handleRefundEvent(tx as never, deps, MASTER, OP.CampaignRefunded, makeTx({ source: null }));

    expect(tx.campaign.findUnique).not.toHaveBeenCalled();
  });
});
