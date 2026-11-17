import { deflate } from "pako";
import { Address, beginCell, fromNano, toNano } from "@ton/core";
import type { PrismaClient } from "@prisma/client";
import { resolveLocale, type Locale } from "../i18n/index.js";
import { isTestnet, normalizeTonAddress } from "../utils/ton-address.js";
import { WIDGET_TEMPLATE } from "./donation-widget-html.js";

export const OP_DONATE = 0x10000001;
export const WIDGET_MIN_GRAM = 1;
export const WIDGET_MAX_GRAM = 1000;
export const WIDGET_TX_TTL_SECONDS = 300;
const INTENT_TTL_MS = 30 * 60 * 1000;
const TITLE_MAX_CHARS = 80;
const STORY_MAX_CHARS = 120;
const ORGANIZER_MAX_CHARS = 40;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const WIDGET_HTML_MAX_BYTES = 32768;
export const WIDGET_HTML_MAX_COMPRESSED_BYTES = 4096;
export const WIDGET_DATA_MAX_BYTES = 1024;

type WidgetStrings = {
  of: string;
  dn: string[];
  dy: string[];
  left: string;
  last: string;
  u: string;
  give: string;
  busy: string;
  ok: string;
  okS: string;
  cancel: string;
  err: string;
  done: string;
  doneS: string;
  app: string;
  appS: string;
  hint: string;
  amt: string;
  tip: string;
};

const STRINGS: Record<Locale, WidgetStrings> = {
  ru: {
    of: "из",
    dn: ["донор", "донора", "доноров"],
    dy: ["день", "дня", "дней"],
    left: "осталось {d}",
    last: "последний день",
    u: "GRAM",
    give: "Пожертвовать {n} GRAM",
    busy: "Подтвердите в кошельке…",
    ok: "Спасибо!",
    okS: "Прогресс обновится через минуту",
    cancel: "Перевод отменён. Можно попробовать снова",
    err: "Не получилось. Откройте кампанию в приложении",
    done: "Сбор завершён",
    doneS: "Собрано {n} · {d}",
    app: "Пожертвовать можно в приложении",
    appS: "Нажмите «Открыть кампанию» ниже",
    hint: "Другой кошелёк — «Открыть кампанию» ниже",
    amt: "Пожертвование",
    tip: "Чаевые платформы",
  },
  en: {
    of: "of",
    dn: ["donor", "donors"],
    dy: ["day", "days"],
    left: "{d} left",
    last: "last day",
    u: "GRAM",
    give: "Donate {n} GRAM",
    busy: "Confirm in the wallet…",
    ok: "Thank you!",
    okS: "The progress updates in a minute",
    cancel: "Transfer cancelled. You can try again",
    err: "That didn't work. Open the campaign in the app",
    done: "Fundraising has ended",
    doneS: "Raised {n} · {d}",
    app: "You can donate in the app",
    appS: "Tap “Open campaign” below",
    hint: "Another wallet — “Open campaign” below",
    amt: "Donation",
    tip: "Platform tip",
  },
  hi: {
    of: "/",
    dn: ["दानदाता", "दानदाता"],
    dy: ["दिन", "दिन"],
    left: "{d} बाकी",
    last: "आखिरी दिन",
    u: "GRAM",
    give: "{n} GRAM दान करें",
    busy: "वॉलेट में पुष्टि करें…",
    ok: "धन्यवाद!",
    okS: "प्रगति एक मिनट में अपडेट होगी",
    cancel: "ट्रांसफ़र रद्द हुआ। फिर से कोशिश कर सकते हैं",
    err: "नहीं हो पाया। ऐप में अभियान खोलें",
    done: "संग्रह पूरा हुआ",
    doneS: "जुटाए {n} · {d}",
    app: "ऐप में दान करें",
    appS: "नीचे «अभियान खोलें» दबाएँ",
    hint: "दूसरा वॉलेट — नीचे «अभियान खोलें»",
    amt: "दान",
    tip: "प्लेटफ़ॉर्म टिप",
  },
};

export function buildDonationWidgetHtml(locale: string | null | undefined): string {
  const strings = STRINGS[resolveLocale(locale)];
  const l = JSON.stringify(strings).replace(/</g, "\\u003c");
  return WIDGET_TEMPLATE.replace("__L__", () => l);
}

export type CampaignForWidget = {
  id: string;
  title: string;
  story?: string;
  status: string;
  deployStatus: string;
  onchainAddress: string | null;
  goalAmountUsd: unknown;
  raisedAmountUsd: unknown;
  donorCount: number;
  deadline: Date;
  onchainDeadline: Date | null;
  photos?: string[];
  organizerType?: string;
  channelUsername?: string | null;
  creator?: { tgFirstName: string | null; tgUsername: string | null; kycStatus: string } | null;
  hiddenAt?: Date | null;
};

function widgetDeadline(c: CampaignForWidget): Date {
  return c.onchainDeadline ?? c.deadline;
}

export function isCampaignOpenForWidget(c: CampaignForWidget, now = new Date()): boolean {
  return c.status === "active" && c.deployStatus === "deployed" && Boolean(c.onchainAddress) &&
    widgetDeadline(c).getTime() > now.getTime();
}

export function isCampaignShownInWidget(c: CampaignForWidget): boolean {
  return !c.hiddenAt && ["active", "completed", "expired"].includes(c.status);
}

export function widgetOrganizer(c: CampaignForWidget): string {
  if (c.organizerType === "telegram_channel" && c.channelUsername) return `@${c.channelUsername.replace(/^@/, "")}`;
  return c.creator?.tgFirstName ?? (c.creator?.tgUsername ? `@${c.creator.tgUsername}` : "");
}

function clip(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}

export function buildDonationWidgetChatData(
  c: CampaignForWidget,
  now = new Date(),
  content?: { title: string; story: string },
): string {
  let title = clip(content?.title ?? c.title, TITLE_MAX_CHARS);
  let story = clip(content?.story ?? c.story ?? "", STORY_MAX_CHARS);
  const make = () =>
    JSON.stringify({
      c: c.id,
      t: title,
      a: clip(widgetOrganizer(c), ORGANIZER_MAX_CHARS),
      v: c.creator?.kycStatus === "approved" ? 1 : 0,
      s: story,
      g: Number(c.goalAmountUsd) || 0,
      r: Number(c.raisedAmountUsd) || 0,
      d: c.donorCount,
      e: Math.floor(widgetDeadline(c).getTime() / 1000),
      o: isCampaignOpenForWidget(c, now) ? 1 : 0,
    });
  let data = make();
  while (Buffer.byteLength(data) > WIDGET_DATA_MAX_BYTES && story.length > 1) {
    story = `${story.slice(0, Math.max(1, story.length - 12))}…`;
    data = make();
  }
  while (Buffer.byteLength(data) > WIDGET_DATA_MAX_BYTES && title.length > 1) {
    title = `${title.slice(0, Math.max(1, title.length - 10))}…`;
    data = make();
  }
  return data;
}

export function widgetHtmlSizes(html: string): { bytes: number; compressed: number } {
  return {
    bytes: Buffer.byteLength(html),
    compressed: deflate(Buffer.from(html), { level: 9 }).length,
  };
}

export type ParsedWidgetData = { kind: "pay" | "sent"; campaignId: string; amountGram: string; tipPct: number };

export const WIDGET_MAX_TIP_PCT = 15;

export function parseWidgetData(data: string): ParsedWidgetData | null {
  const m = /^([pd]):([0-9a-f-]{36}):([1-9]\d{0,3})(?::(\d{1,2}))?$/i.exec(data);
  if (!m || !UUID_RE.test(m[2]!)) return null;
  const amount = Number(m[3]);
  if (amount < WIDGET_MIN_GRAM || amount > WIDGET_MAX_GRAM) return null;
  const tipPct = m[4] === undefined ? 0 : Number(m[4]);
  if (tipPct > WIDGET_MAX_TIP_PCT) return null;
  return { kind: m[1] === "p" ? "pay" : "sent", campaignId: m[2]!.toLowerCase(), amountGram: String(amount), tipPct };
}

const widgetTipBps = (tipPct: number) => (tipPct > 0 ? Math.round((tipPct * 10000) / (100 + tipPct)) : 0);

export function widgetTotalNano(amountGram: string, tipPct = 0): bigint {
  const keep = 10000n - BigInt(widgetTipBps(tipPct));
  return (toNano(amountGram) * 10000n + keep - 1n) / keep;
}

export function buildWidgetDonationTransaction(
  contractAddress: string,
  amountGram: string,
  testnet = isTestnet(),
  nowSeconds = Math.floor(Date.now() / 1000),
  tipPct = 0,
) {
  const tipBps = widgetTipBps(tipPct);
  const total = widgetTotalNano(amountGram, tipPct);
  const payload = beginCell().storeUint(OP_DONATE, 32).storeUint(tipBps, 32).endCell().toBoc().toString("base64");
  return {
    valid_until: nowSeconds + WIDGET_TX_TTL_SECONDS,
    network: testnet ? "-3" : "-239",
    messages: [
      {
        address: Address.parse(contractAddress).toString({ bounceable: true, urlSafe: true, testOnly: testnet }),
        amount: total.toString(),
        payload,
      },
    ],
  };
}

export type WidgetQueryType =
  | { type: "data"; wallet_card?: { address: string } }
  | { type: "sent_transaction"; wallet: { address: string }; msg_hash: string }
  | { type: "sign_data" };

export type WidgetQuery = {
  id: string;
  from: { id: number };
  chat?: { id: number };
  message_id?: number;
  type: WidgetQueryType;
  data: string;
};

export type WidgetDeps = {
  prisma: PrismaClient;
  answer: (queryId: string, data: string) => Promise<unknown>;
  log: { warn: (obj: unknown, msg: string) => void; info: (obj: unknown, msg: string) => void };
  scheduleRefresh: (chatId: number, messageId: number, campaignId: string) => void;
  testnet?: boolean;
  now?: () => Date;
};

const CAMPAIGN_SELECT = {
  id: true,
  title: true,
  story: true,
  language: true,
  status: true,
  deployStatus: true,
  onchainAddress: true,
  goalAmountUsd: true,
  raisedAmountUsd: true,
  donorCount: true,
  deadline: true,
  onchainDeadline: true,
  photos: true,
  organizerType: true,
  channelUsername: true,
  creator: { select: { tgFirstName: true, tgUsername: true, kycStatus: true } },
  hiddenAt: true,
} as const;

export async function loadCampaignForWidget(prisma: PrismaClient, campaignId: string) {
  return prisma.campaign.findUnique({ where: { id: campaignId }, select: CAMPAIGN_SELECT });
}

async function createIntent(deps: WidgetDeps, q: WidgetQuery, campaignId: string, address: string, amountGram: string, tipPct: number) {
  const testnet = deps.testnet ?? isTestnet();
  const donor = await deps.prisma.user.findUnique({ where: { tgUserId: BigInt(q.from.id) }, select: { id: true } });
  const now = deps.now?.() ?? new Date();
  await deps.prisma.donationIntent.create({
    data: {
      campaignId,
      donorId: donor?.id ?? null,
      donorTgUserId: BigInt(q.from.id),
      donorAddress: normalizeTonAddress(address, testnet),
      amountToken: fromNano(widgetTotalNano(amountGram, tipPct)),
      token: "GRAM",
      isAnonymous: false,
      expiresAt: new Date(now.getTime() + INTENT_TTL_MS),
    },
  });
}

export async function handleDonationWidgetQuery(deps: WidgetDeps, q: WidgetQuery): Promise<void> {
  const reply = (body: Record<string, unknown>) => deps.answer(q.id, JSON.stringify(body));
  const parsed = parseWidgetData(q.data);
  if (!parsed) {
    await reply({ e: "err" });
    return;
  }
  const testnet = deps.testnet ?? isTestnet();
  const now = deps.now?.() ?? new Date();

  if (parsed.kind === "pay") {
    if (q.type.type !== "data" || !q.type.wallet_card?.address) {
      await reply({ e: "err" });
      return;
    }
    const campaign = await loadCampaignForWidget(deps.prisma, parsed.campaignId);
    if (!campaign || !isCampaignOpenForWidget(campaign, now) || !campaign.onchainAddress) {
      await reply({ e: "ended" });
      return;
    }
    await createIntent(deps, q, campaign.id, q.type.wallet_card.address, parsed.amountGram, parsed.tipPct);
    const tx = buildWidgetDonationTransaction(campaign.onchainAddress, parsed.amountGram, testnet, Math.floor(now.getTime() / 1000), parsed.tipPct);
    await reply({ tx });
    return;
  }

  if (q.type.type !== "sent_transaction") {
    await reply({ e: "err" });
    return;
  }
  const intentExists = await deps.prisma.donationIntent.findFirst({
    where: {
      campaignId: parsed.campaignId,
      donorTgUserId: BigInt(q.from.id),
      donorAddress: normalizeTonAddress(q.type.wallet.address, testnet),
      matchedAt: null,
      expiresAt: { gte: now },
    },
    select: { id: true },
  });
  if (!intentExists) {
    await createIntent(deps, q, parsed.campaignId, q.type.wallet.address, parsed.amountGram, parsed.tipPct);
  }
  deps.log.info(
    { campaignId: parsed.campaignId, amountGram: parsed.amountGram, tipPct: parsed.tipPct, msgHash: q.type.msg_hash },
    "donation widget: transaction sent",
  );
  await reply({ ok: 1 });
  if (q.chat && q.message_id) deps.scheduleRefresh(q.chat.id, q.message_id, parsed.campaignId);
}
