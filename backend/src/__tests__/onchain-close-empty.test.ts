import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { Address } from "@ton/core";

let mod: typeof import("../services/onchain-owner-ops.js");
type State = import("../services/onchain-owner-ops.js").OnchainCampaignState;

const NEW_MASTER = "EQACq3RNZDBSh4fdrv-4HAayKaynWSzRq_qeVNJ1C7lO1duC";
const OLD_MASTER = "EQBUjdUs__YNPjDMuGwIZIjluGSImf3u8jJaxGdQ1dVxmKq1";
const ALIEN_MASTER = "EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs";

const CAMPAIGN_ADDR = "EQBMAFOOtuzApqFpVwWIZsKIg74rV0AoHAd55YYVOLlv-3gR";
const USDT_MASTER = ALIEN_MASTER;

const STATUS_ACTIVE = 0;
const STATUS_FUNDED = 1;

beforeAll(async () => {
  mod = await import("../services/onchain-owner-ops.js");
});

beforeEach(() => {
  process.env.HARMONY_MASTER_ADDR = NEW_MASTER;
  process.env.HARMONY_MASTER_ADDRS = `${NEW_MASTER},${OLD_MASTER}`;
  process.env.HARMONY_USDT_MASTER_ADDR = USDT_MASTER;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function state(over: Partial<State> = {}): State {
  return {
    campaignId: "4",
    master: OLD_MASTER,
    status: STATUS_ACTIVE,
    donorCount: 0,
    raisedTon: "0",
    raisedUsdt: "0.000000",
    goalTon: "10.0",
    goalUsdt: "0.000000",
    deadline: Math.floor(Date.now() / 1000) - 86400,
    balance: "0.197966",
    ...over,
  };
}

describe("closeEmptyRefusal across a master redeploy", () => {
  it("accepts a campaign left behind by a previous master of ours", () => {
    expect(mod.closeEmptyRefusal(state({ master: OLD_MASTER }))).toBeNull();
  });

  it("accepts a campaign of the current master", () => {
    expect(mod.closeEmptyRefusal(state({ master: NEW_MASTER }))).toBeNull();
  });

  it("still refuses a master we have never deployed", () => {
    expect(mod.closeEmptyRefusal(state({ master: ALIEN_MASTER }))).toBe("foreign_master");
  });

  it("falls back to the single-address variable when the list is not configured", () => {
    delete process.env.HARMONY_MASTER_ADDRS;
    expect(mod.closeEmptyRefusal(state({ master: NEW_MASTER }))).toBeNull();
    expect(mod.closeEmptyRefusal(state({ master: OLD_MASTER }))).toBe("foreign_master");
  });

  it("keeps refusing for the contract's own reasons", () => {
    expect(mod.closeEmptyRefusal(state({ donorCount: 1 }))).toBe("campaign_not_empty");
    expect(mod.closeEmptyRefusal(state({ raisedUsdt: "2.000000" }))).toBe("campaign_not_empty");
    expect(mod.closeEmptyRefusal(state({ deadline: Math.floor(Date.now() / 1000) + 3600 }))).toBe(
      "deadline_not_passed",
    );
    expect(mod.closeEmptyRefusal(state({ status: STATUS_FUNDED }))).toBe("campaign_not_active");
  });
});

describe("closeEmptyRefusalWithJettons", () => {
  function stubFetch(impl: () => Promise<unknown> | unknown) {
    vi.stubGlobal("fetch", vi.fn(impl));
  }

  it("refuses a campaign holding USDT its own books know nothing about", async () => {
    stubFetch(() => ({ ok: true, status: 200, json: async () => ({ balance: "2020000" }) }));
    expect(await mod.closeEmptyRefusalWithJettons(state(), CAMPAIGN_ADDR)).toBe("campaign_holds_usdt");
  });

  it("accepts a campaign whose jetton wallet does not exist", async () => {
    stubFetch(() => ({ ok: false, status: 404, json: async () => ({}) }));
    expect(await mod.closeEmptyRefusalWithJettons(state(), CAMPAIGN_ADDR)).toBeNull();
  });

  it("accepts a campaign whose jetton wallet is empty", async () => {
    stubFetch(() => ({ ok: true, status: 200, json: async () => ({ balance: "0" }) }));
    expect(await mod.closeEmptyRefusalWithJettons(state(), CAMPAIGN_ADDR)).toBeNull();
  });

  it("refuses rather than guesses when the balance cannot be read", async () => {
    stubFetch(() => Promise.reject(new Error("network down")));
    expect(await mod.closeEmptyRefusalWithJettons(state(), CAMPAIGN_ADDR)).toBe("usdt_balance_unknown");
  });

  it("does not spend a jetton call on a campaign that is refused anyway", async () => {
    const fetchMock = vi.fn(() => ({ ok: true, status: 200, json: async () => ({ balance: "0" }) }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await mod.closeEmptyRefusalWithJettons(state({ donorCount: 2 }), CAMPAIGN_ADDR)).toBe(
      "campaign_not_empty",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("accountIsDestroyed", () => {
  function stubFetch(impl: () => Promise<unknown> | unknown) {
    vi.stubGlobal("fetch", vi.fn(impl));
  }

  it("recognises a destroyed contract", async () => {
    stubFetch(() => ({ ok: true, status: 200, json: async () => ({ status: "nonexist" }) }));
    expect(await mod.accountIsDestroyed(CAMPAIGN_ADDR)).toBe(true);
  });

  it("recognises an address that was never deployed", async () => {
    stubFetch(() => ({ ok: true, status: 200, json: async () => ({ status: "uninit" }) }));
    expect(await mod.accountIsDestroyed(CAMPAIGN_ADDR)).toBe(true);
  });

  it("does not call a live contract destroyed", async () => {
    stubFetch(() => ({ ok: true, status: 200, json: async () => ({ status: "active" }) }));
    expect(await mod.accountIsDestroyed(CAMPAIGN_ADDR)).toBe(false);
  });

  it("does not call a storage-frozen account destroyed", async () => {
    stubFetch(() => ({ ok: true, status: 200, json: async () => ({ status: "frozen" }) }));
    expect(await mod.accountIsDestroyed(CAMPAIGN_ADDR)).toBe(false);
  });

  it("answers null when it cannot tell, rather than guessing either way", async () => {
    stubFetch(() => Promise.reject(new Error("network down")));
    expect(await mod.accountIsDestroyed(CAMPAIGN_ADDR)).toBeNull();
  });
});

describe("tonClientOptions", () => {
  it("carries the api key, so the panel reads are not anonymous", () => {
    process.env.TON_CENTER_API_KEY = "test-key";
    expect(mod.tonClientOptions().apiKey).toBe("test-key");
  });

  it("stays keyless when nothing is configured", () => {
    delete process.env.TON_CENTER_API_KEY;
    expect(mod.tonClientOptions().apiKey).toBeUndefined();
  });
});

describe("prepareOwnerOp closeEmptyCampaign", () => {
  it("addresses the campaign's own master, not the one in config", async () => {
    const prepared = await mod.prepareOwnerOp({
      op: "closeEmptyCampaign",
      campaignId: "4",
      masterAddress: OLD_MASTER,
    });
    expect(Address.parse(prepared.to).equals(Address.parse(OLD_MASTER))).toBe(true);
    expect(Address.parse(prepared.to).equals(Address.parse(NEW_MASTER))).toBe(false);
  });

  it("refuses to address a master that is not ours", async () => {
    await expect(
      mod.prepareOwnerOp({ op: "closeEmptyCampaign", campaignId: "4", masterAddress: ALIEN_MASTER }),
    ).rejects.toThrow(/HARMONY_MASTER_ADDRS/);
  });
});
