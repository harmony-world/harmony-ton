import { describe, it, expect, beforeAll } from "vitest";

let claimRefusal: typeof import("../services/onchain-owner-ops.js").claimRefusal;
type State = import("../services/onchain-owner-ops.js").OnchainCampaignState;

const MASTER = "EQABAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAc3j";
const GAS = "0.05";

beforeAll(async () => {
  process.env.HARMONY_MASTER_ADDR = MASTER;
  claimRefusal = (await import("../services/onchain-owner-ops.js")).claimRefusal;
});

const STATUS_ACTIVE = 0;
const STATUS_FUNDED = 1;
const STATUS_REFUNDED = 2;
const STATUS_FROZEN = 3;

const HOUR = 3600;
const now = () => Math.floor(Date.now() / 1000);

function state(over: Partial<State> = {}): State {
  return {
    campaignId: "7",
    master: MASTER,
    status: STATUS_ACTIVE,
    donorCount: 2,
    raisedTon: "5.0",
    raisedUsdt: "0.000000",
    goalTon: "10.0",
    goalUsdt: "0.000000",
    deadline: now() - HOUR,
    balance: "5.1",
    ...over,
  };
}

describe("claimRefusal", () => {
  it("accepts a finished campaign that missed its goal", () => {
    expect(claimRefusal(state(), GAS)).toBeNull();
  });

  it("accepts a campaign that reached its goal before the deadline", () => {
    expect(
      claimRefusal(state({ raisedTon: "10.0", balance: "10.1", deadline: now() + HOUR }), GAS),
    ).toBeNull();
  });

  it("names the status when the money has already gone out", () => {
    expect(claimRefusal(state({ status: STATUS_FUNDED }), GAS)).toBe("already_claimed");
    expect(claimRefusal(state({ status: STATUS_FROZEN }), GAS)).toBe("campaign_frozen");
    expect(claimRefusal(state({ status: STATUS_REFUNDED }), GAS)).toBe("campaign_refunded");
  });

  it("refuses a campaign with nothing on it", () => {
    expect(claimRefusal(state({ raisedTon: "0", raisedUsdt: "0.000000" }), GAS)).toBe("nothing_raised");
  });

  it("refuses only while the collection is still running", () => {
    expect(claimRefusal(state({ deadline: now() + HOUR }), GAS)).toBe("fundraising_in_progress");
  });

  it("reads the USDT goal as well as the TON one", () => {
    const usdt = { raisedTon: "0", raisedUsdt: "100.000000", goalTon: "0", goalUsdt: "100.000000" };
    expect(claimRefusal(state({ ...usdt, deadline: now() + HOUR }), GAS)).toBeNull();
    expect(
      claimRefusal(state({ ...usdt, raisedUsdt: "99.000000", deadline: now() + HOUR }), GAS),
    ).toBe("fundraising_in_progress");
  });

  it("refuses when the balance cannot cover the payout and its gas", () => {
    expect(claimRefusal(state({ balance: "4.9" }), GAS)).toBe("insufficient_balance");
  });

  it("counts the attached gas towards the balance the contract checks", () => {
    expect(claimRefusal(state({ balance: "4.98" }), GAS)).toBeNull();
    expect(claimRefusal(state({ balance: "4.98" }), "0")).toBe("insufficient_balance");
  });

  it("requires the extra jetton leg once the campaign holds USDT", () => {
    const withUsdt = { raisedUsdt: "12.000000", goalUsdt: "0.000000" };
    expect(claimRefusal(state({ ...withUsdt, balance: "5.0" }), GAS)).toBe("insufficient_balance");
    expect(claimRefusal(state({ balance: "5.0" }), GAS)).toBeNull();
    expect(claimRefusal(state({ ...withUsdt, balance: "5.0" }), "0.1")).toBeNull();
  });
});
