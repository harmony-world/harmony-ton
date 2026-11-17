import { describe, it, expect, vi, beforeEach } from "vitest";
import { createBot } from "../bot/index.js";
import {
  sendNewDonation,
  sendCampaignApproved,
  sendDeployerLowBalanceAlert,
  shouldSendOpsAlert,
} from "../bot/notifications.js";
import type { Api } from "grammy";
import type { UserFromGetMe } from "grammy/types";

const STUB_BOT_INFO: UserFromGetMe = {
  id: 1234567890,
  is_bot: true,
  first_name: "TestBot",
  username: "testbot",
  can_join_groups: false,
  can_read_all_group_messages: false,
  supports_inline_queries: false,
  can_connect_to_business: false,
  has_main_web_app: false,
  has_topics_enabled: false,
  allows_users_to_create_topics: false,
  can_manage_bots: false,
  supports_join_request_queries: false,
};

const BOT_TOKEN = "1234567890:test_bot_token_for_unit_tests";

describe("createBot", () => {
  beforeEach(() => {
    process.env.BOT_TOKEN = BOT_TOKEN;
    process.env.WEB_APP_URL = "https://t.me/testbot/app";
  });

  it("creates bot instance with token", () => {
    const bot = createBot(BOT_TOKEN, STUB_BOT_INFO);
    expect(bot).toBeDefined();
    expect(typeof bot.handleUpdate).toBe("function");
  });

  it("/start sends welcome message with web_app button", async () => {
    const bot = createBot(BOT_TOKEN, STUB_BOT_INFO);

    type Payload = { chat_id?: number; text?: string; reply_markup?: unknown };
    let capturedMethod = "";
    let capturedPayload: Payload = {};
    bot.api.config.use(async (_prev, method, payload) => {
      capturedMethod = method;
      capturedPayload = payload as Payload;
      return { ok: true, result: {} } as never;
    });

    await bot.handleUpdate({
      update_id: 1,
      message: {
        message_id: 1,
        date: Math.floor(Date.now() / 1000),
        chat: { id: 123456, type: "private" },
        from: { id: 123456, is_bot: false, first_name: "Test" },
        text: "/start",
        entities: [{ type: "bot_command", offset: 0, length: 6 }],
      },
    } as never);

    expect(capturedMethod).toBe("sendPhoto");
    expect(capturedPayload.chat_id).toBe(123456);
    expect((capturedPayload as { caption?: string }).caption).toContain("HARMONY");
    const markup = capturedPayload.reply_markup as {
      inline_keyboard: { text: string; web_app: { url: string } }[][];
    };
    expect(markup.inline_keyboard[0][0].web_app.url).toBe("https://t.me/testbot/app");
    expect(markup.inline_keyboard[1][0].web_app.url).toBe("https://t.me/testbot/app/#/create");
  });

  it("/start sets the chat's menu button in the user's language and still replies when that fails", async () => {
    const bot = createBot(BOT_TOKEN, STUB_BOT_INFO);
    const calls: Array<{ method: string; payload: Record<string, unknown> }> = [];
    bot.api.config.use(async (_prev, method, payload) => {
      calls.push({ method, payload: payload as Record<string, unknown> });
      if (method === "setChatMenuButton") return { ok: false, error_code: 400, description: "nope" } as never;
      return { ok: true, result: {} } as never;
    });

    await bot.handleUpdate({
      update_id: 2,
      message: {
        message_id: 1,
        date: Math.floor(Date.now() / 1000),
        chat: { id: 777, type: "private" },
        from: { id: 777, is_bot: false, first_name: "Test", language_code: "en" },
        text: "/start",
        entities: [{ type: "bot_command", offset: 0, length: 6 }],
      },
    } as never);

    const menu = calls.find((c) => c.method === "setChatMenuButton")!;
    expect(menu.payload).toMatchObject({ chat_id: 777, menu_button: { type: "web_app", text: "Open" } });
    const reply = calls.at(-1)!;
    expect(reply.method).toBe("sendPhoto");
    expect(reply.payload.caption).toContain("Welcome to HARMONY");
  });

  it("/start profile_<uuid> opens the public profile route", async () => {
    const bot = createBot(BOT_TOKEN, STUB_BOT_INFO);
    const userId = "6a649e70-88bd-4347-89a2-f92c8568caef";

    type Payload = { chat_id?: number; text?: string; reply_markup?: unknown };
    let capturedPayload: Payload = {};
    bot.api.config.use(async (_prev, _method, payload) => {
      capturedPayload = payload as Payload;
      return { ok: true, result: {} } as never;
    });

    await bot.handleUpdate({
      update_id: 2,
      message: {
        message_id: 2,
        date: Math.floor(Date.now() / 1000),
        chat: { id: 123456, type: "private" },
        from: { id: 123456, is_bot: false, first_name: "Test", language_code: "en" },
        text: `/start profile_${userId}`,
        entities: [{ type: "bot_command", offset: 0, length: 6 }],
      },
    } as never);

    expect(capturedPayload.text).toBe("Someone shared a public Harmony profile with you 💙");
    const markup = capturedPayload.reply_markup as {
      inline_keyboard: { text: string; web_app: { url: string } }[][];
    };
    const button = markup.inline_keyboard[0][0];
    expect(button.text).toBe("Open profile");
    expect(button.web_app.url).toBe(`https://t.me/testbot/app/#/profile/${userId}`);
  });

  it("/start profile_<invalid> falls back to welcome", async () => {
    const bot = createBot(BOT_TOKEN, STUB_BOT_INFO);

    type Payload = { text?: string; reply_markup?: unknown };
    let capturedPayload: Payload = {};
    bot.api.config.use(async (_prev, _method, payload) => {
      capturedPayload = payload as Payload;
      return { ok: true, result: {} } as never;
    });

    await bot.handleUpdate({
      update_id: 3,
      message: {
        message_id: 3,
        date: Math.floor(Date.now() / 1000),
        chat: { id: 123456, type: "private" },
        from: { id: 123456, is_bot: false, first_name: "Test" },
        text: "/start profile_../../admin",
        entities: [{ type: "bot_command", offset: 0, length: 6 }],
      },
    } as never);

    expect((capturedPayload as { caption?: string }).caption).toContain("HARMONY");
  });
});

describe("notifications", () => {
  const mockApi = {
    sendMessage: vi.fn().mockResolvedValue({}),
  } as unknown as Api;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sendNewDonation sends correct message", async () => {
    await sendNewDonation(mockApi, BigInt(111222333), "10.50", "Help the kids");

    expect(mockApi.sendMessage).toHaveBeenCalledOnce();
    const [chatId, text] = (mockApi.sendMessage as ReturnType<typeof vi.fn>).mock.calls[0] as [number, string];
    expect(chatId).toBe(111222333);
    expect(text).toContain("$10.50");
    expect(text).toContain("Help the kids");
  });

  it("sendCampaignApproved sends correct message", async () => {
    await sendCampaignApproved(mockApi, BigInt(444555666), "Save the forest");

    expect(mockApi.sendMessage).toHaveBeenCalledOnce();
    const [chatId, text] = (mockApi.sendMessage as ReturnType<typeof vi.fn>).mock.calls[0] as [number, string];
    expect(chatId).toBe(444555666);
    expect(text).toContain("Save the forest");
    expect(text).toContain("согласована");
  });

  it("skips delivery to a service account with a synthetic tgUserId", async () => {
    await sendCampaignApproved(mockApi, BigInt(-1), "Save the forest");
    await sendNewDonation(mockApi, BigInt(-1), "10.50", "Save the forest");

    expect(mockApi.sendMessage).not.toHaveBeenCalled();
  });

  it("sendDeployerLowBalanceAlert sends ops alert to numeric chat id", async () => {
    await sendDeployerLowBalanceAlert(mockApi, BigInt(100200300), {
      address: "kQDeployer",
      balanceGram: "1.5",
      minBalanceGram: "2",
      campaignId: "camp-0001",
      campaignTitle: "Help the kids",
    });

    expect(mockApi.sendMessage).toHaveBeenCalledOnce();
    const [chatId, text] = (mockApi.sendMessage as ReturnType<typeof vi.fn>).mock.calls[0] as [number, string];
    expect(chatId).toBe(100200300);
    expect(text).toContain("ниже 2 GRAM");
    expect(text).toContain("kQDeployer");
    expect(text).toContain("Help the kids");
  });

  it("rate-limits duplicate ops alerts", () => {
    process.env.OPS_ALERT_RATE_LIMIT_MS = "1000";

    expect(shouldSendOpsAlert("test-alert", 10_000)).toBe(true);
    expect(shouldSendOpsAlert("test-alert", 10_500)).toBe(false);
    expect(shouldSendOpsAlert("test-alert", 11_100)).toBe(true);

    delete process.env.OPS_ALERT_RATE_LIMIT_MS;
  });

  it("sendNewDonation propagates API errors", async () => {
    (mockApi.sendMessage as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("API error"));

    await expect(
      sendNewDonation(mockApi, BigInt(999), "5.00", "Campaign")
    ).rejects.toThrow("API error");
  });
});
