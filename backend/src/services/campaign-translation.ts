import type { FastifyBaseLogger } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { Credentials, Translator, type TextResult } from "@translated/lara";
import { getEnv } from "../config/env.js";
import { resolveLocale, type Locale } from "../i18n/index.js";

type CampaignContent = {
  id: string;
  title: string;
  story: string;
  language: string | null;
};

export type CampaignTranslationMeta = {
  requestedLanguage: Locale;
  sourceLanguage: string | null;
  translated: boolean;
  source: "original" | "cache" | "google" | "lara" | "unavailable";
};

type LocalizedCampaignContent = {
  title: string;
  story: string;
  translation: CampaignTranslationMeta;
};

type TranslationProviderResult = {
  title: string;
  story: string;
  source: "lara";
};

const LARA_LOCALE_BY_APP_LOCALE: Record<Locale, string> = {
  ru: "ru-RU",
  en: "en-US",
  hi: "hi-IN",
};

const LARA_TRANSLATION_INSTRUCTIONS =
  "Translate charity campaign content accurately. Preserve names, dates, amounts, medical terms, and factual claims. Do not add or remove facts.";

let laraTranslator: Translator | null = null;
let laraTranslatorCredentialsKey: string | null = null;

const inflightTranslations = new Map<string, Promise<TranslationProviderResult | null>>();

function titleForStorage(title: string): string {
  return title.length > 100 ? title.slice(0, 100) : title;
}

function shouldUseNoTrace(): boolean {
  return getEnv("LARA_TRANSLATION_NO_TRACE") !== "false";
}

function getLaraTranslator(): Translator | null {
  const accessKeyId = getEnv("LARA_ACCESS_KEY_ID");
  const accessKeySecret = getEnv("LARA_ACCESS_KEY_SECRET");
  if (!accessKeyId || !accessKeySecret) return null;

  const credentialsKey = `${accessKeyId}:${accessKeySecret}`;
  if (!laraTranslator || laraTranslatorCredentialsKey !== credentialsKey) {
    laraTranslator = new Translator(new Credentials(accessKeyId, accessKeySecret));
    laraTranslatorCredentialsKey = credentialsKey;
  }

  return laraTranslator;
}

function parseLaraTranslation(result: TextResult<string[]>): { title: string; story: string } | null {
  const [title, story] = result.translation;
  if (!title || !story) return null;
  return { title: titleForStorage(title), story };
}

function hasCyrillicText(campaign: CampaignContent): boolean {
  return /[А-Яа-яЁё]/.test(`${campaign.title}\n${campaign.story}`);
}

function resolveSourceLanguage(campaign: CampaignContent): Locale | null {
  if (campaign.language) return resolveLocale(campaign.language);
  return hasCyrillicText(campaign) ? "ru" : null;
}

async function translateWithLara(
  campaign: CampaignContent,
  targetLanguage: Locale,
  sourceLanguage: Locale,
  log?: FastifyBaseLogger,
): Promise<TranslationProviderResult | null> {
  const translator = getLaraTranslator();
  if (!translator) return null;

  try {
    const result = await translator.translate(
      [campaign.title, campaign.story],
      LARA_LOCALE_BY_APP_LOCALE[sourceLanguage],
      LARA_LOCALE_BY_APP_LOCALE[targetLanguage],
      {
        contentType: "text/plain",
        instructions: [LARA_TRANSLATION_INSTRUCTIONS],
        noTrace: shouldUseNoTrace(),
        style: "faithful",
        timeoutInMillis: 10000,
      },
    );
    const parsed = parseLaraTranslation(result);
    return parsed ? { ...parsed, source: "lara" } : null;
  } catch (err) {
    log?.warn({ err }, "campaign translation failed");
    return null;
  }
}

export async function localizeCampaignContent(
  prisma: PrismaClient,
  campaign: CampaignContent,
  targetLanguageRaw: string | null | undefined,
  log?: FastifyBaseLogger,
): Promise<LocalizedCampaignContent> {
  const requestedLanguage = resolveLocale(targetLanguageRaw);
  const sourceLanguage = resolveSourceLanguage(campaign);
  const original = {
    title: campaign.title,
    story: campaign.story,
    translation: {
      requestedLanguage,
      sourceLanguage,
      translated: false,
      source: "original" as const,
    },
  };

  if (!sourceLanguage || sourceLanguage === requestedLanguage) return original;

  const cached = await prisma.campaignTranslation.findUnique({
    where: {
      campaignId_language: {
        campaignId: campaign.id,
        language: requestedLanguage,
      },
    },
    select: { title: true, story: true, source: true },
  });
  if (cached) {
    return {
      title: cached.title,
      story: cached.story,
      translation: {
        requestedLanguage,
        sourceLanguage,
        translated: true,
        source: cached.source === "google" ? "cache" : "cache",
      },
    };
  }

  const dedupKey = `${campaign.id}:${requestedLanguage}`;
  const inflight = inflightTranslations.get(dedupKey);
  const translationPromise = inflight ?? translateWithLara(campaign, requestedLanguage, sourceLanguage, log);
  if (!inflight) {
    inflightTranslations.set(dedupKey, translationPromise);
    translationPromise.finally(() => inflightTranslations.delete(dedupKey));
  }
  const translated = await translationPromise;
  if (!translated) {
    return {
      ...original,
      translation: { ...original.translation, source: "unavailable" },
    };
  }

  const saved = await prisma.campaignTranslation.upsert({
    where: {
      campaignId_language: {
        campaignId: campaign.id,
        language: requestedLanguage,
      },
    },
    create: {
      campaignId: campaign.id,
      language: requestedLanguage,
      title: translated.title,
      story: translated.story,
      source: translated.source,
    },
    update: {
      title: translated.title,
      story: translated.story,
      source: translated.source,
      translatedAt: new Date(),
    },
    select: { title: true, story: true },
  });

  return {
    title: saved.title,
    story: saved.story,
    translation: {
      requestedLanguage,
      sourceLanguage,
      translated: true,
      source: translated.source,
    },
  };
}
