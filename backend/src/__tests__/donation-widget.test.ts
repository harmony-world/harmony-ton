import { describe, expect, it, vi } from "vitest";
import { Cell, fromNano } from "@ton/core";
import { PNG } from "pngjs";
import {
  WIDGET_DATA_MAX_BYTES,
  WIDGET_HTML_MAX_BYTES,
  WIDGET_HTML_MAX_COMPRESSED_BYTES,
  buildDonationWidgetChatData,
  buildDonationWidgetHtml,
  buildWidgetDonationTransaction,
  handleDonationWidgetQuery,
  isCampaignOpenForWidget,
  isCampaignShownInWidget,
  parseWidgetData,
  widgetHtmlSizes,
  type CampaignForWidget,
  type WidgetDeps,
  type WidgetQuery,
} from "../bot/donation-widget.js";
import { WIDGET_PHOTO_MAX_CHARS, WIDGET_PHOTO_RE, buildWidgetPhotoDataUrl, cropAndShrink } from "../bot/donation-widget-photo.js";

const CAMPAIGN_ID = "3aed3492-3977-47c0-8ec2-5d1eff8a2f85";
const CONTRACT = "EQC11w-vvpNLniGan6qBEWvMQOKmaggLNbaAkX5VmxuxLyoS";
const NOW = new Date("2026-11-10T12:00:00.000Z");

function campaign(overrides: Partial<CampaignForWidget> = {}): CampaignForWidget {
  return {
    id: CAMPAIGN_ID,
    title: "Новый тест",
    status: "active",
    deployStatus: "deployed",
    onchainAddress: CONTRACT,
    goalAmountUsd: "100.00",
    raisedAmountUsd: "12.50",
    donorCount: 3,
    deadline: new Date("2026-11-12T00:00:00.000Z"),
    onchainDeadline: new Date("2026-11-12T00:00:00.000Z"),
    ...overrides,
  };
}

describe("donation widget — limits from the Bot API", () => {
  it.each(["ru", "en", "hi"])("HTML for %s fits 32 KB and 4 KB compressed", (locale) => {
    const { bytes, compressed } = widgetHtmlSizes(buildDonationWidgetHtml(locale));
    expect(bytes).toBeLessThanOrEqual(WIDGET_HTML_MAX_BYTES);
    expect(compressed).toBeLessThanOrEqual(WIDGET_HTML_MAX_COMPRESSED_BYTES);
  });

  it("chat_data stays within 1024 bytes for a long non-Latin title", () => {
    for (const ch of ["Ж", "क", "\u0007"]) {
      const data = buildDonationWidgetChatData(campaign({ title: ch.repeat(400) }), NOW);
      expect(Buffer.byteLength(data)).toBeLessThanOrEqual(WIDGET_DATA_MAX_BYTES);
      expect(JSON.parse(data)).toMatchObject({ c: CAMPAIGN_ID, g: 100, r: 12.5, d: 3, o: 1 });
    }
  });

  it("chat_data names the organizer, marks KYC, carries the story and the on-chain deadline", () => {
    const personal = JSON.parse(
      buildDonationWidgetChatData(
        campaign({
          story: "  Собираем  тёплые вещи\nдля приюта. ".repeat(10),
          creator: { tgFirstName: "Анна", tgUsername: "anna", kycStatus: "approved" },
        }),
        NOW,
      ),
    );
    expect(personal).toMatchObject({ a: "Анна", v: 1, e: Date.parse("2026-11-12T00:00:00.000Z") / 1000 });
    expect(personal.s).toHaveLength(120);
    expect(personal.s.endsWith("…")).toBe(true);
    expect(personal.s).not.toMatch(/\s{2}|\n/);

    const channel = JSON.parse(
      buildDonationWidgetChatData(
        campaign({ organizerType: "telegram_channel", channelUsername: "kind_news", creator: { tgFirstName: "Анна", tgUsername: null, kycStatus: "pending" } }),
        NOW,
      ),
    );
    expect(channel).toMatchObject({ a: "@kind_news", v: 0 });
  });

  it("chat_data uses the viewer's translation when given", () => {
    const data = JSON.parse(buildDonationWidgetChatData(campaign({ story: "История" }), NOW, { title: "New test", story: "A story" }));
    expect(data).toMatchObject({ t: "New test", s: "A story" });
  });

  it("chat_data shortens the story before the title", () => {
    const data = buildDonationWidgetChatData(campaign({ title: "\u0007".repeat(80), story: "\u0007".repeat(140) }), NOW);
    expect(Buffer.byteLength(data)).toBeLessThanOrEqual(WIDGET_DATA_MAX_BYTES);
    expect(JSON.parse(data).t).toBe("\u0007".repeat(80));
    expect(JSON.parse(data).s.length).toBeLessThan(120);
  });

  it("plural forms: three in Russian, two elsewhere", () => {
    const strings = (locale: string) => JSON.parse(/var L=|const L=(\{.*?\});/.exec(buildDonationWidgetHtml(locale))![1]!.replace(/\\u003c/g, "<"));
    expect(strings("ru").dn).toHaveLength(3);
    expect(strings("en").dn).toEqual(["donor", "donors"]);
    expect(strings("hi").dy).toHaveLength(2);
  });

  it("no string can close the script element, every placeholder is filled", () => {
    for (const locale of ["ru", "en", "hi"]) {
      const html = buildDonationWidgetHtml(locale);
      expect(html.match(/<\/script>/g)).toHaveLength(1);
      expect(html).not.toContain("__");
    }
  });
});

describe("campaign state", () => {
  it("is open only when active, deployed, with an address and before the on-chain deadline", () => {
    expect(isCampaignOpenForWidget(campaign(), NOW)).toBe(true);
    expect(isCampaignOpenForWidget(campaign({ status: "completed" }), NOW)).toBe(false);
    expect(isCampaignOpenForWidget(campaign({ deployStatus: "retrying" }), NOW)).toBe(false);
    expect(isCampaignOpenForWidget(campaign({ onchainAddress: null }), NOW)).toBe(false);
    expect(
      isCampaignOpenForWidget(campaign({ deadline: new Date("2026-12-01"), onchainDeadline: new Date("2026-11-01") }), NOW),
    ).toBe(false);
  });
});

describe("which campaigns get the card", () => {
  it("open and finished ones do; refunded, frozen and unpublished ones get the mini app button", () => {
    for (const status of ["active", "completed", "expired"]) expect(isCampaignShownInWidget(campaign({ status }))).toBe(true);
    for (const status of ["refunded", "frozen", "pending", "pending_moderation", "rejected"]) {
      expect(isCampaignShownInWidget(campaign({ status }))).toBe(false);
    }
  });

  it("a finished campaign's card opens in the ended state", () => {
    expect(JSON.parse(buildDonationWidgetChatData(campaign({ status: "completed" }), NOW)).o).toBe(0);
  });
});

describe("parseWidgetData", () => {
  it("reads pay and sent requests with the amount in whole GRAM", () => {
    expect(parseWidgetData(`p:${CAMPAIGN_ID}:5`)).toEqual({ kind: "pay", campaignId: CAMPAIGN_ID, amountGram: "5", tipPct: 0 });
    expect(parseWidgetData(`d:${CAMPAIGN_ID}:250`)).toEqual({ kind: "sent", campaignId: CAMPAIGN_ID, amountGram: "250", tipPct: 0 });
  });

  it("reads the platform tip, 0…15 %, and treats a card sent before tips as 0", () => {
    expect(parseWidgetData(`p:${CAMPAIGN_ID}:5:1`)?.tipPct).toBe(1);
    expect(parseWidgetData(`d:${CAMPAIGN_ID}:5:0`)?.tipPct).toBe(0);
    expect(parseWidgetData(`p:${CAMPAIGN_ID}:5:15`)?.tipPct).toBe(15);
    expect(parseWidgetData(`p:${CAMPAIGN_ID}:5:16`)).toBeNull();
    expect(parseWidgetData(`p:${CAMPAIGN_ID}:5:-1`)).toBeNull();
    expect(parseWidgetData(`p:${CAMPAIGN_ID}:5:1.5`)).toBeNull();
    expect(parseWidgetData(`p:${CAMPAIGN_ID}:5:100`)).toBeNull();
  });

  it("accepts exactly 1…1000", () => {
    expect(parseWidgetData(`p:${CAMPAIGN_ID}:1`)?.amountGram).toBe("1");
    expect(parseWidgetData(`p:${CAMPAIGN_ID}:1000`)?.amountGram).toBe("1000");
    expect(parseWidgetData(`p:${CAMPAIGN_ID}:0`)).toBeNull();
    expect(parseWidgetData(`p:${CAMPAIGN_ID}:1001`)).toBeNull();
    expect(parseWidgetData(`p:${CAMPAIGN_ID}:99999`)).toBeNull();
  });

  it("rejects fractions, signs, leading zeros and exponents", () => {
    for (const n of ["1.5", "-5", "+5", "05", "1e3", " 5", "5 ", ""]) {
      expect(parseWidgetData(`p:${CAMPAIGN_ID}:${n}`)).toBeNull();
    }
  });

  it("rejects a non-UUID and anything else", () => {
    expect(parseWidgetData("p:not-a-uuid-not-a-uuid-not-a-uuid-xxx:5")).toBeNull();
    expect(parseWidgetData(`x:${CAMPAIGN_ID}:5`)).toBeNull();
    expect(parseWidgetData(`p:${CAMPAIGN_ID}:5:extra`)).toBeNull();
  });
});

describe("buildWidgetDonationTransaction", () => {
  it("matches the mini app's donation: OP_DONATE with no tip to the bounceable contract address", () => {
    const tx = buildWidgetDonationTransaction(CONTRACT, "5", false, 1_000);
    expect(tx.valid_until).toBe(1_300);
    expect(tx.network).toBe("-239");
    expect(tx.messages).toHaveLength(1);
    expect(tx.messages[0]!.address).toBe(CONTRACT);
    expect(tx.messages[0]!.amount).toBe("5000000000");
    const body = Cell.fromBase64(tx.messages[0]!.payload).beginParse();
    expect(body.loadUint(32)).toBe(0x10000001);
    expect(body.loadUint(32)).toBe(0);
  });

  it.each([1, 7, 15])("puts a %i %% tip on top: the contract's share leaves exactly the chosen donation", (tipPct) => {
    const tx = buildWidgetDonationTransaction(CONTRACT, "5", false, 1_000, tipPct);
    const body = Cell.fromBase64(tx.messages[0]!.payload).beginParse();
    body.loadUint(32);
    const tipBps = BigInt(body.loadUint(32));
    expect(tipBps).toBe(BigInt(Math.round((tipPct * 10000) / (100 + tipPct))));
    const total = BigInt(tx.messages[0]!.amount);
    const donation = total - (total * tipBps) / 10000n;
    expect(donation >= 5_000_000_000n).toBe(true);
    expect(donation - 5_000_000_000n < 2n).toBe(true);
    expect(Number(total) / 5e9).toBeCloseTo(1 + tipPct / 100, 3);
  });

  it("names the testnet so Telegram's mainnet wallet refuses it instead of paying the wrong chain", () => {
    expect(buildWidgetDonationTransaction(CONTRACT, "1", true).network).toBe("-3");
  });
});

function makeDeps(found: CampaignForWidget | null) {
  const answers: Array<{ id: string; body: Record<string, unknown> }> = [];
  const intents: unknown[] = [];
  const prisma = {
    campaign: { findUnique: vi.fn().mockResolvedValue(found) },
    user: { findUnique: vi.fn().mockResolvedValue({ id: "user-1" }) },
    donationIntent: {
      create: vi.fn(async (args: { data: unknown }) => {
        intents.push(args.data);
        return {};
      }),
      findFirst: vi.fn().mockResolvedValue(null),
    },
  };
  const scheduleRefresh = vi.fn();
  const deps: WidgetDeps = {
    prisma: prisma as never,
    answer: async (id, data) => {
      answers.push({ id, body: JSON.parse(data) as Record<string, unknown> });
    },
    log: { warn: vi.fn(), info: vi.fn() },
    scheduleRefresh,
    testnet: false,
    now: () => NOW,
  };
  return { deps, answers, intents, prisma, scheduleRefresh };
}

function query(data: string, type: WidgetQuery["type"]): WidgetQuery {
  return { id: "q1", from: { id: 100200300 }, chat: { id: 100200300 }, message_id: 77, type, data };
}

describe("handleDonationWidgetQuery", () => {
  it("pay: leaves an intent for the user and answers with the transaction", async () => {
    const { deps, answers, intents } = makeDeps(campaign());
    await handleDonationWidgetQuery(deps, query(`p:${CAMPAIGN_ID}:5`, { type: "data", wallet_card: { address: CONTRACT } }));

    expect(intents).toEqual([
      expect.objectContaining({ campaignId: CAMPAIGN_ID, donorId: "user-1", donorTgUserId: 100200300n, amountToken: "5", token: "GRAM" }),
    ]);
    const tx = answers[0]!.body.tx as { messages: Array<{ amount: string }> };
    expect(tx.messages[0]!.amount).toBe("5000000000");
  });

  it("pay with a 1 % tip: the transaction carries the tip on top, and the intent holds the same total", async () => {
    const { deps, answers, intents } = makeDeps(campaign());
    await handleDonationWidgetQuery(deps, query(`p:${CAMPAIGN_ID}:5:1`, { type: "data", wallet_card: { address: CONTRACT } }));

    const tx = answers[0]!.body.tx as { messages: Array<{ amount: string; payload: string }> };
    expect(Number(tx.messages[0]!.amount) / 1e9).toBeCloseTo(5.05, 3);
    expect(intents).toEqual([expect.objectContaining({ amountToken: fromNano(BigInt(tx.messages[0]!.amount)) })]);
    const body = Cell.fromBase64(tx.messages[0]!.payload).beginParse();
    body.loadUint(32);
    expect(body.loadUint(32)).toBe(99);
  });

  it("a 5 % tip gives an intent equal to the sent total", async () => {
    const { deps, answers, intents } = makeDeps(campaign());
    await handleDonationWidgetQuery(deps, query(`p:${CAMPAIGN_ID}:5:5`, { type: "data", wallet_card: { address: CONTRACT } }));

    const tx = answers[0]!.body.tx as { messages: Array<{ amount: string }> };
    expect(tx.messages[0]!.amount).toBe("5249895003");
    expect(intents).toEqual([expect.objectContaining({ amountToken: "5.249895003" })]);
  });

  it("pay: a closed campaign gets no transaction and no intent", async () => {
    const { deps, answers, intents } = makeDeps(campaign({ status: "completed" }));
    await handleDonationWidgetQuery(deps, query(`p:${CAMPAIGN_ID}:5`, { type: "data", wallet_card: { address: CONTRACT } }));
    expect(answers[0]!.body).toEqual({ e: "ended" });
    expect(intents).toHaveLength(0);
  });

  it("pay without the wallet card is refused", async () => {
    const { deps, answers, intents } = makeDeps(campaign());
    await handleDonationWidgetQuery(deps, query(`p:${CAMPAIGN_ID}:5`, { type: "data" }));
    expect(answers[0]!.body).toEqual({ e: "err" });
    expect(intents).toHaveLength(0);
  });

  it("sent: a different paying wallet gets its own intent, the card refreshes later", async () => {
    const { deps, answers, intents, scheduleRefresh } = makeDeps(campaign());
    await handleDonationWidgetQuery(
      deps,
      query(`d:${CAMPAIGN_ID}:5`, { type: "sent_transaction", wallet: { address: CONTRACT }, msg_hash: "abc" }),
    );
    expect(intents).toHaveLength(1);
    expect(answers[0]!.body).toEqual({ ok: 1 });
    expect(scheduleRefresh).toHaveBeenCalledWith(100200300, 77, CAMPAIGN_ID);
  });

  it("sent: no duplicate intent when the paying wallet already has one", async () => {
    const { deps, intents, prisma } = makeDeps(campaign());
    prisma.donationIntent.findFirst.mockResolvedValueOnce({ id: "i1" });
    await handleDonationWidgetQuery(
      deps,
      query(`d:${CAMPAIGN_ID}:5`, { type: "sent_transaction", wallet: { address: CONTRACT }, msg_hash: "abc" }),
    );
    expect(intents).toHaveLength(0);
  });

  it("garbage data is answered, so the widget does not wait 15 seconds", async () => {
    const { deps, answers } = makeDeps(campaign());
    await handleDonationWidgetQuery(deps, query("hello", { type: "data" }));
    expect(answers[0]!.body).toEqual({ e: "err" });
  });
});

describe("campaign photo for the card", () => {
  function png(width: number, height: number, paint: (x: number, y: number) => [number, number, number]): Buffer {
    const img = new PNG({ width, height });
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const [r, g, b] = paint(x, y);
        const o = (y * width + x) * 4;
        img.data[o] = r;
        img.data[o + 1] = g;
        img.data[o + 2] = b;
        img.data[o + 3] = 255;
      }
    }
    return PNG.sync.write(img);
  }

  it("crops the middle band of a tall photo and averages it", () => {
    const tall = PNG.sync.read(png(100, 300, (_x, y) => (y >= 100 && y < 200 ? [0, 255, 0] : [0, 0, 0])));
    const out = cropAndShrink({ width: tall.width, height: tall.height, data: tall.data }, 10, 10);
    expect(Array.from(out.subarray(0, 4))).toEqual([0, 255, 0, 255]);
    expect(Array.from(out.subarray(out.length - 4))).toEqual([0, 255, 0, 255]);
  });

  it("a detailed photo becomes a data: WebP that fits public_data", async () => {
    let seed = 7;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) % 256;
    const url = await buildWidgetPhotoDataUrl(png(640, 360, () => [rnd(), rnd(), rnd()]));
    expect(url).toMatch(WIDGET_PHOTO_RE);
    expect(url!.length).toBeLessThanOrEqual(WIDGET_PHOTO_MAX_CHARS);
    expect(WIDGET_PHOTO_MAX_CHARS).toBe(WIDGET_DATA_MAX_BYTES);
    expect(Buffer.from(url!.split(",")[1]!, "base64").subarray(8, 12).toString()).toBe("WEBP");
  });

  it("returns null for anything that is not a PNG or JPEG", async () => {
    expect(await buildWidgetPhotoDataUrl(Buffer.from("GIF89a"))).toBeNull();
  });
});
