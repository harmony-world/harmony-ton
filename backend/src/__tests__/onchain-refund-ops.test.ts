import { describe, it, expect, beforeAll } from "vitest";

let refundOrderValueGram: typeof import("../services/onchain-owner-ops.js").refundOrderValueGram;
let refundRefusal: typeof import("../services/onchain-owner-ops.js").refundRefusal;
type State = import("../services/onchain-owner-ops.js").OnchainCampaignState;

const MASTER = "EQABAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAc3j";

beforeAll(async () => {
  process.env.HARMONY_MASTER_ADDR = MASTER;
  const mod = await import("../services/onchain-owner-ops.js");
  refundOrderValueGram = mod.refundOrderValueGram;
  refundRefusal = mod.refundRefusal;
});

const STATUS_ACTIVE = 0;
const STATUS_FROZEN = 3;

function state(over: Partial<State> = {}): State {
  return {
    campaignId: "7",
    master: MASTER,
    status: STATUS_FROZEN,
    donorCount: 3,
    raisedTon: "5.0",
    raisedUsdt: "0.000000",
    goalTon: "10.0",
    goalUsdt: "0.000000",
    deadline: 0,
    balance: "5.2",
    ...over,
  };
}

describe("refundOrderValueGram", () => {
  it("charges one batch of gas for a campaign that fits in a single batch", () => {
    expect(refundOrderValueGram(state({ donorCount: 3 }))).toBeCloseTo(0.2, 6);
    expect(refundOrderValueGram(state({ donorCount: 10 }))).toBeCloseTo(0.2, 6);
  });

  it("adds a batch as soon as the donors spill past the batch size", () => {
    expect(refundOrderValueGram(state({ donorCount: 11 }))).toBeCloseTo(0.3, 6);
    expect(refundOrderValueGram(state({ donorCount: 21 }))).toBeCloseTo(0.4, 6);
  });

  it("pays for a jetton transfer per donor once the campaign holds any USDT", () => {
    expect(refundOrderValueGram(state({ donorCount: 3, raisedUsdt: "12.500000" }))).toBeCloseTo(0.35, 6);
  });

  it("assumes every donor has a USDT leg, because the contract does not say who did", () => {
    const withUsdt = refundOrderValueGram(state({ donorCount: 12, raisedUsdt: "0.000001" }));
    expect(withUsdt).toBeCloseTo(0.9, 6);
    expect(refundOrderValueGram(state({ donorCount: 12, raisedUsdt: "0.000000" }))).toBeCloseTo(0.3, 6);
  });

  it("never orders a refund with zero attached, even with a donorCount of zero", () => {
    expect(refundOrderValueGram(state({ donorCount: 0 }))).toBeGreaterThan(0);
  });
});

describe("refundRefusal", () => {
  it("accepts a frozen campaign of this master with donors", () => {
    expect(refundRefusal(state())).toBeNull();
  });

  it("refuses a campaign that is not frozen", () => {
    expect(refundRefusal(state({ status: STATUS_ACTIVE }))).toBe("campaign_not_frozen");
  });

  it("refuses a campaign with nothing to return", () => {
    expect(refundRefusal(state({ donorCount: 0 }))).toBe("nothing_to_refund");
  });

  it("refuses a campaign belonging to an earlier master", () => {
    expect(refundRefusal(state({ master: "EQACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAsoi" }))).toBe(
      "foreign_master",
    );
  });
});
