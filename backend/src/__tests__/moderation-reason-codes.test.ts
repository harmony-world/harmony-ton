import { describe, it, expect } from "vitest";
import { LIST_REASON_CODES } from "../constants/moderation-reason-codes.js";
import { t, type Locale } from "../i18n/index.js";

const LOCALES: Locale[] = ["ru", "en", "hi"];

describe("list reason codes", () => {
  for (const locale of LOCALES) {
    it(`every accepted reason code has its own message in ${locale}`, () => {
      const fallback = t(locale, "campaign.reject.default");
      const missing = LIST_REASON_CODES.filter(
        (code) => t(locale, `campaign.reject.${code}`) === fallback,
      );
      expect(missing).toEqual([]);
    });
  }

  it("offers a generic code for categories that have no message of their own", () => {
    expect(LIST_REASON_CODES).toContain("PROHIBITED_CATEGORY");
  });
});
