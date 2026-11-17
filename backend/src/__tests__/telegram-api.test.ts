import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TelegramApiClient, telegramApi } from "../services/telegram-api.js";

describe("TelegramApiClient", () => {
  const fetchSpy = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("builds correct GET URL with params", async () => {
    fetchSpy.mockResolvedValue({
      json: () => Promise.resolve({ ok: true, result: {} }),
    });

    const client = new TelegramApiClient("123:TOKEN");
    await client.get("getChat", { chat_id: 42 });

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("https://api.telegram.org/bot123:TOKEN/getChat?chat_id=42"),
    );
  });

  it("builds GET URL without params", async () => {
    fetchSpy.mockResolvedValue({
      json: () => Promise.resolve({ ok: true, result: {} }),
    });

    const client = new TelegramApiClient("123:TOKEN");
    await client.get("getMe");

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.telegram.org/bot123:TOKEN/getMe",
    );
  });

  it("sends POST with JSON body", async () => {
    fetchSpy.mockResolvedValue({
      json: () => Promise.resolve({ ok: true, result: { message_id: 1 } }),
    });

    const client = new TelegramApiClient("123:TOKEN");
    await client.post("sendMessage", { chat_id: 42, text: "hello" });

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.telegram.org/bot123:TOKEN/sendMessage",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: 42, text: "hello" }),
      }),
    );
  });

  it("fetchFile builds correct file URL", async () => {
    fetchSpy.mockResolvedValue(new Response("image-bytes"));

    const client = new TelegramApiClient("123:TOKEN");
    await client.fetchFile("photos/file_42.jpg");

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.telegram.org/file/bot123:TOKEN/photos/file_42.jpg",
    );
  });

  it("telegramApi factory returns client instance", () => {
    const client = telegramApi("456:TOK");
    expect(client).toBeInstanceOf(TelegramApiClient);
  });
});
