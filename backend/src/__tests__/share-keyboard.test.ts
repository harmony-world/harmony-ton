import { describe, expect, it } from "vitest";
import { campaignShareKeyboard } from "../routes/share.js";

describe("campaign share message", () => {
  it("carries a button that opens the bot on the campaign's deep link", () => {
    const link = "https://t.me/Gram_Harmony_Bot?start=c_3aed3492-3977-47c0-8ec2-5d1eff8a2f85";
    expect(campaignShareKeyboard("ru", link)).toEqual({ inline_keyboard: [[{ text: "💝 Помочь", url: link }]] });
    expect(campaignShareKeyboard("en", link).inline_keyboard[0]![0]!.text).toBe("💝 Donate");
    expect(campaignShareKeyboard("hi", link).inline_keyboard[0]![0]!.text).toBe("💝 दान करें");
  });
});
