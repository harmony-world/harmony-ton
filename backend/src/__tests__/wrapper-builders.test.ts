import { describe, it, expect } from "vitest";
import { requireBuilders, StaleWrappersError } from "../services/wrapper-builders.js";

describe("requireBuilders — a stale wrappers/dist must refuse loudly", () => {
  it("returns the builders when the compiled module has them all", () => {
    const freeze = () => "freeze";
    const refund = () => "refund";
    const builders = requireBuilders({ buildFreezeCampaignMsg: freeze, buildRefundCampaignMsg: refund }, [
      "buildFreezeCampaignMsg",
      "buildRefundCampaignMsg",
    ]);

    expect(builders.buildFreezeCampaignMsg).toBe(freeze);
    expect(builders.buildRefundCampaignMsg).toBe(refund);
  });

  it("refuses when a builder is absent — this is the mainnet failure of 2026-09-24", () => {
    expect(() =>
      requireBuilders({ buildCloseEmptyCampaignMsg: () => "close" }, [
        "buildCloseEmptyCampaignMsg",
        "buildFreezeCampaignMsg",
      ]),
    ).toThrow(StaleWrappersError);
  });

  it("names every missing builder and the command that fixes them", () => {
    let message = "";
    try {
      requireBuilders({}, ["buildFreezeCampaignMsg", "buildUnfreezeCampaignMsg", "buildRefundCampaignMsg"]);
    } catch (err) {
      message = (err as Error).message;
    }

    expect(message).toContain("buildFreezeCampaignMsg");
    expect(message).toContain("buildUnfreezeCampaignMsg");
    expect(message).toContain("buildRefundCampaignMsg");
    expect(message).toContain("contracts/harmony/wrappers-ts");
  });

  it("treats a non-function export as missing", () => {
    expect(() => requireBuilders({ buildFreezeCampaignMsg: "not a function" }, ["buildFreezeCampaignMsg"])).toThrow(
      StaleWrappersError,
    );
  });
});
