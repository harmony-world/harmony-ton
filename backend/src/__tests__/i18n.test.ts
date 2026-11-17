import { describe, expect, it } from "vitest";
import { resolveLocale, t } from "../i18n/index.js";

describe("backend i18n", () => {
  it("resolves supported locales from language headers", () => {
    expect(resolveLocale("en-US,en;q=0.9")).toBe("en");
    expect(resolveLocale("hi-IN")).toBe("hi");
    expect(resolveLocale("fr-FR,ru;q=0.8")).toBe("ru");
    expect(resolveLocale(undefined)).toBe("ru");
    expect(resolveLocale("de-DE")).toBe("en");
  });

  it("interpolates variables and falls back to en for unsupported locales", () => {
    expect(t("en", "campaign.rateLimit", { max: 1, label: "per day" })).toBe(
      "Campaign creation limit: no more than 1 per day.",
    );
    expect(t("fr", "campaign.rateLimit.day")).toBe(t("en", "campaign.rateLimit.day"));
  });

  it("keeps localized bot notifications available for supported locales", () => {
    expect(t("ru", "bot.startCampaignButton")).toBe("Открыть кампанию");
    expect(t("en", "bot.startCampaignButton")).toBe("Open campaign");
    expect(t("hi", "bot.startCampaignButton")).toBe("अभियान खोलें");
    expect(t("ru", "bot.startProfileButton")).toBe("Открыть профиль");
    expect(t("en", "bot.startProfileButton")).toBe("Open profile");
    expect(t("hi", "bot.startProfileButton")).toBe("प्रोफ़ाइल खोलें");
  });
});
