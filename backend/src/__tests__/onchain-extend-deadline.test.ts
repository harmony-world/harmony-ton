import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { Address, Cell } from "@ton/core";

let mod: typeof import("../services/onchain-owner-ops.js");

const MASTER = "EQACq3RNZDBSh4fdrv-4HAayKaynWSzRq_qeVNJ1C7lO1duC";
const OLD_MASTER = "EQBUjdUs__YNPjDMuGwIZIjluGSImf3u8jJaxGdQ1dVxmKq1";
const USDT_MASTER = "EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs";

const OP_EXTEND_CAMPAIGN_DEADLINE = 0x2000000f;

beforeAll(async () => {
  mod = await import("../services/onchain-owner-ops.js");
});

beforeEach(() => {
  process.env.HARMONY_MASTER_ADDR = MASTER;
  process.env.HARMONY_MASTER_ADDRS = `${MASTER},${OLD_MASTER}`;
  process.env.HARMONY_USDT_MASTER_ADDR = USDT_MASTER;
  vi.useRealTimers();
});

function parsePayload(payloadBase64: string) {
  const slice = Cell.fromBase64(payloadBase64).beginParse();
  return {
    op: slice.loadUint(32),
    campaignId: slice.loadUintBig(64),
    newDeadline: slice.loadUint(32),
  };
}

describe("prepareOwnerOp extendCampaignDeadline", () => {
  it("carries the exact timestamp the platform asked for", async () => {
    const newDeadlineUnix = Math.floor(Date.now() / 1000) + 7 * 86400;

    const prepared = await mod.prepareOwnerOp({
      op: "extendCampaignDeadline",
      campaignId: "9",
      newDeadlineUnix,
    });

    const body = parsePayload(prepared.payload);
    expect(body.op).toBe(OP_EXTEND_CAMPAIGN_DEADLINE);
    expect(body.campaignId).toBe(9n);
    expect(body.newDeadline).toBe(newDeadlineUnix);
  });

  it("addresses the master, never the campaign", async () => {
    const prepared = await mod.prepareOwnerOp({
      op: "extendCampaignDeadline",
      campaignId: "9",
      newDeadlineUnix: Math.floor(Date.now() / 1000) + 86400,
    });
    expect(Address.parse(prepared.to).equals(Address.parse(MASTER))).toBe(true);
  });

  it("refuses a deadline in the past instead of letting the chain refuse it", async () => {
    await expect(
      mod.prepareOwnerOp({
        op: "extendCampaignDeadline",
        campaignId: "9",
        newDeadlineUnix: Math.floor(Date.now() / 1000) - 60,
      }),
    ).rejects.toThrow(/future/);
  });

  it("refuses a non-integer timestamp", async () => {
    await expect(
      mod.prepareOwnerOp({
        op: "extendCampaignDeadline",
        campaignId: "9",
        newDeadlineUnix: Math.floor(Date.now() / 1000) + 86400.5,
      }),
    ).rejects.toThrow(/future/);
  });

  it("says in the summary which campaign and until when", async () => {
    const prepared = await mod.prepareOwnerOp({
      op: "extendCampaignDeadline",
      campaignId: "9",
      newDeadlineUnix: Math.floor(Date.parse("2027-03-01T12:00:00Z") / 1000),
    });
    expect(prepared.summary).toContain("#9");
    expect(prepared.summary).toContain("2027-03-01 12:00");
  });
});
