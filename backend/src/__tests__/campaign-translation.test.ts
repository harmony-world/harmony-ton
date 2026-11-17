import { afterEach, describe, expect, it, vi } from "vitest";
import { localizeCampaignContent } from "../services/campaign-translation.js";

const translateMock = vi.hoisted(() => vi.fn());

vi.mock("@translated/lara", () => {
  class Credentials {
    constructor(
      public accessKeyId: string,
      public accessKeySecret: string,
    ) {}
  }

  class Translator {
    translate = translateMock;
  }

  return { Credentials, Translator };
});

const ORIGINAL_LARA_ACCESS_KEY_ID = process.env.LARA_ACCESS_KEY_ID;
const ORIGINAL_LARA_ACCESS_KEY_SECRET = process.env.LARA_ACCESS_KEY_SECRET;
const ORIGINAL_LARA_TRANSLATION_NO_TRACE = process.env.LARA_TRANSLATION_NO_TRACE;

afterEach(() => {
  if (ORIGINAL_LARA_ACCESS_KEY_ID === undefined) {
    delete process.env.LARA_ACCESS_KEY_ID;
  } else {
    process.env.LARA_ACCESS_KEY_ID = ORIGINAL_LARA_ACCESS_KEY_ID;
  }
  if (ORIGINAL_LARA_ACCESS_KEY_SECRET === undefined) {
    delete process.env.LARA_ACCESS_KEY_SECRET;
  } else {
    process.env.LARA_ACCESS_KEY_SECRET = ORIGINAL_LARA_ACCESS_KEY_SECRET;
  }
  if (ORIGINAL_LARA_TRANSLATION_NO_TRACE === undefined) {
    delete process.env.LARA_TRANSLATION_NO_TRACE;
  } else {
    process.env.LARA_TRANSLATION_NO_TRACE = ORIGINAL_LARA_TRANSLATION_NO_TRACE;
  }
  translateMock.mockReset();
  vi.restoreAllMocks();
});

describe("campaign translation", () => {
  const campaign = {
    id: "00000000-0000-0000-0000-000000000001",
    title: "Помощь семье",
    story: "Нужна помощь после пожара",
    language: "ru",
  };

  it("returns original content when target language matches source", async () => {
    const prisma = {
      campaignTranslation: { findUnique: vi.fn(), upsert: vi.fn() },
    };

    const result = await localizeCampaignContent(prisma as never, campaign, "ru");

    expect(result.title).toBe(campaign.title);
    expect(result.translation).toMatchObject({ translated: false, source: "original" });
    expect(prisma.campaignTranslation.findUnique).not.toHaveBeenCalled();
  });

  it("returns cached translation when available", async () => {
    const prisma = {
      campaignTranslation: {
        findUnique: vi.fn().mockResolvedValue({
          title: "Help for a family",
          story: "Help is needed after a fire",
          source: "google",
        }),
        upsert: vi.fn(),
      },
    };

    const result = await localizeCampaignContent(prisma as never, campaign, "en-US,en;q=0.9");

    expect(result.title).toBe("Help for a family");
    expect(result.story).toBe("Help is needed after a fire");
    expect(result.translation).toMatchObject({ requestedLanguage: "en", translated: true, source: "cache" });
  });

  it("falls back to original content when Lara credentials are not configured", async () => {
    delete process.env.LARA_ACCESS_KEY_ID;
    delete process.env.LARA_ACCESS_KEY_SECRET;
    const prisma = {
      campaignTranslation: {
        findUnique: vi.fn().mockResolvedValue(null),
        upsert: vi.fn(),
      },
    };

    const result = await localizeCampaignContent(prisma as never, campaign, "hi");

    expect(result.title).toBe(campaign.title);
    expect(result.translation).toMatchObject({ requestedLanguage: "hi", translated: false, source: "unavailable" });
    expect(prisma.campaignTranslation.upsert).not.toHaveBeenCalled();
  });

  it("translates and caches campaign content with Lara", async () => {
    process.env.LARA_ACCESS_KEY_ID = "lara-id";
    process.env.LARA_ACCESS_KEY_SECRET = "lara-secret";
    process.env.LARA_TRANSLATION_NO_TRACE = "true";
    translateMock.mockResolvedValue({
      translation: ["Help for a family", "Help is needed after a fire"],
    });
    const prisma = {
      campaignTranslation: {
        findUnique: vi.fn().mockResolvedValue(null),
        upsert: vi.fn().mockResolvedValue({
          title: "Help for a family",
          story: "Help is needed after a fire",
        }),
      },
    };

    const result = await localizeCampaignContent(prisma as never, campaign, "en");

    expect(result.title).toBe("Help for a family");
    expect(result.story).toBe("Help is needed after a fire");
    expect(result.translation).toMatchObject({ requestedLanguage: "en", translated: true, source: "lara" });
    expect(translateMock).toHaveBeenCalledWith(
      [campaign.title, campaign.story],
      "ru-RU",
      "en-US",
      expect.objectContaining({
        noTrace: true,
        style: "faithful",
      }),
    );
    expect(prisma.campaignTranslation.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ source: "lara" }),
        update: expect.objectContaining({ source: "lara" }),
      }),
    );
  });

  it("uses Russian source language for legacy Cyrillic campaigns without language", async () => {
    process.env.LARA_ACCESS_KEY_ID = "lara-id";
    process.env.LARA_ACCESS_KEY_SECRET = "lara-secret";
    translateMock.mockResolvedValue({
      translation: ["Help for a family", "Help is needed after a fire"],
    });
    const prisma = {
      campaignTranslation: {
        findUnique: vi.fn().mockResolvedValue(null),
        upsert: vi.fn().mockResolvedValue({
          title: "Help for a family",
          story: "Help is needed after a fire",
        }),
      },
    };

    const result = await localizeCampaignContent(prisma as never, { ...campaign, language: null }, "en");

    expect(result.translation).toMatchObject({
      requestedLanguage: "en",
      sourceLanguage: "ru",
      translated: true,
      source: "lara",
    });
    expect(translateMock).toHaveBeenCalledWith(
      [campaign.title, campaign.story],
      "ru-RU",
      "en-US",
      expect.any(Object),
    );
  });
});
