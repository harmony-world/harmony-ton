import { describe, it, expect, vi } from "vitest";
import { handleCampaignGasReturn } from "../indexer/handlers.js";
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

type Row = {
  id: string;
  deployStatus: string;
  donorCount: number;
  raisedAmountToken: unknown;
  raisedAmountUsd: unknown;
};

function makeClient(campaign: Row | null) {
  return {
    campaign: {
      findUnique: vi.fn().mockResolvedValue(campaign),
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

const empty: Row = {
  id: "camp-1",
  deployStatus: "deployed",
  donorCount: 0,
  raisedAmountToken: 0,
  raisedAmountUsd: 0,
};

describe("the closing gas return reaches the indexer at all", () => {
  it("has an event type, or polling drops it before dispatch", () => {
    expect(opToEventType(OP.CampaignGasReturn)).toBe("CAMPAIGN_GAS_RETURN");
  });
});

describe("handleCampaignGasReturn", () => {
  it("marks an empty campaign closed, found by the message sender", async () => {
    const tx = makeClient(empty);
    await handleCampaignGasReturn(tx as never, deps, MASTER, makeTx());

    expect(tx.campaign.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { onchainAddress: CAMPAIGN } }),
    );
    expect(tx.campaign.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { deployStatus: "closed" } }),
    );
  });

  it("leaves a campaign that raised money alone — that gas return is a claim", async () => {
    const tx = makeClient({ ...empty, donorCount: 3, raisedAmountToken: "12.5" });
    await handleCampaignGasReturn(tx as never, deps, MASTER, makeTx());

    expect(tx.campaign.update).not.toHaveBeenCalled();
  });

  it("treats a raised amount with no donor on record as money all the same", async () => {
    const tx = makeClient({ ...empty, raisedAmountToken: "2.02" });
    await handleCampaignGasReturn(tx as never, deps, MASTER, makeTx());

    expect(tx.campaign.update).not.toHaveBeenCalled();
  });

  it("writes nothing twice", async () => {
    const tx = makeClient({ ...empty, deployStatus: "closed" });
    await handleCampaignGasReturn(tx as never, deps, MASTER, makeTx());

    expect(tx.campaign.update).not.toHaveBeenCalled();
  });

  it("ignores a sender that is not a campaign of ours", async () => {
    const tx = makeClient(null);
    await handleCampaignGasReturn(tx as never, deps, MASTER, makeTx());

    expect(tx.campaign.update).not.toHaveBeenCalled();
  });

  it("ignores a message with no sender", async () => {
    const tx = makeClient(empty);
    await handleCampaignGasReturn(tx as never, deps, MASTER, makeTx({ source: undefined }));

    expect(tx.campaign.findUnique).not.toHaveBeenCalled();
    expect(tx.campaign.update).not.toHaveBeenCalled();
  });
});
