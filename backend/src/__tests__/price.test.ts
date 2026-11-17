import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getTonPrice,
  getLastFetchedAt,
  getLastPriceSource,
  fetchTonPriceNow,
  startPricePolling,
  stopPricePolling,
  _resetForTest,
} from "../services/price.js";

function stubFetchOk(usd: number) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ "the-open-network": { usd } }),
    })
  );
}

function stubFetchError() {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));
}

function stubFetchBadStatus() {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: false, status: 429 })
  );
}

describe("getTonPrice — initial state", () => {
  beforeEach(() => _resetForTest());
  afterEach(() => vi.unstubAllGlobals());

  it("returns 0 before any fetch", () => {
    expect(getTonPrice()).toBe(0);
  });

  it("getLastFetchedAt returns 0 before any fetch", () => {
    expect(getLastFetchedAt()).toBe(0);
  });
});

describe("fetchTonPriceNow", () => {
  beforeEach(() => _resetForTest());
  afterEach(() => vi.unstubAllGlobals());

  it("updates cache on successful response", async () => {
    stubFetchOk(5.42);
    await fetchTonPriceNow();
    expect(getTonPrice()).toBe(5.42);
    expect(getLastFetchedAt()).toBeGreaterThan(0);
  });

  it("keeps last known price when API returns non-ok status", async () => {
    stubFetchOk(3.0);
    await fetchTonPriceNow();

    stubFetchBadStatus();
    await fetchTonPriceNow();

    expect(getTonPrice()).toBe(3.0);
  });

  it("keeps last known price on network error (fallback)", async () => {
    stubFetchOk(2.5);
    await fetchTonPriceNow();

    stubFetchError();
    await fetchTonPriceNow();

    expect(getTonPrice()).toBe(2.5);
  });

  it("ignores response with missing usd field", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ "the-open-network": {} }),
      })
    );
    await fetchTonPriceNow();
    expect(getTonPrice()).toBe(0);
  });

  it("ignores response with zero price", async () => {
    stubFetchOk(0);
    await fetchTonPriceNow();
    expect(getTonPrice()).toBe(0);
  });

  it("uses COINGECKO_API_URL env variable", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ "the-open-network": { usd: 1.0 } }),
    });
    vi.stubGlobal("fetch", mockFetch);
    process.env.COINGECKO_API_URL = "https://custom.api.example.com/v3";

    await fetchTonPriceNow();

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("custom.api.example.com")
    );
    delete process.env.COINGECKO_API_URL;
  });
});

describe("fetchTonPriceNow — source chain", () => {
  beforeEach(() => _resetForTest());
  afterEach(() => vi.unstubAllGlobals());

  function stubPerUrl(map: Record<string, { ok: boolean; status?: number; body?: unknown }>) {
    const fetchMock = vi.fn(async (url: string) => {
      const hit = Object.entries(map).find(([fragment]) => url.includes(fragment));
      if (!hit) return { ok: false, status: 404 };
      const [, res] = hit;
      return { ok: res.ok, status: res.status ?? 200, json: async () => res.body };
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("falls back to tonapi when coingecko is blocked", async () => {
    stubPerUrl({
      "api.coingecko.com": { ok: false, status: 403 },
      "tonapi.io": { ok: true, body: { rates: { TON: { prices: { USD: 1.83 } } } } },
    });

    await expect(fetchTonPriceNow()).resolves.toBe(true);
    expect(getTonPrice()).toBe(1.83);
    expect(getLastPriceSource()).toBe("tonapi");
  });

  it("falls back to binance when coingecko and tonapi both fail", async () => {
    stubPerUrl({
      "api.coingecko.com": { ok: false, status: 403 },
      "tonapi.io": { ok: false, status: 500 },
      "api.binance.com": { ok: true, body: { price: "1.9012" } },
    });

    await expect(fetchTonPriceNow()).resolves.toBe(true);
    expect(getTonPrice()).toBeCloseTo(1.9012);
    expect(getLastPriceSource()).toBe("binance");
  });

  it("reads coinbase as the last resort", async () => {
    stubPerUrl({ "api.coinbase.com": { ok: true, body: { data: { amount: "2.05" } } } });

    await expect(fetchTonPriceNow()).resolves.toBe(true);
    expect(getLastPriceSource()).toBe("coinbase");
  });

  it("returns false and keeps the last price when every source fails", async () => {
    stubPerUrl({ "api.coingecko.com": { ok: true, body: { "the-open-network": { usd: 1.5 } } } });
    await fetchTonPriceNow();

    stubPerUrl({});
    await expect(fetchTonPriceNow()).resolves.toBe(false);
    expect(getTonPrice()).toBe(1.5);
    expect(getLastPriceSource()).toBe("coingecko");
  });

  it("rejects an out-of-range price and moves on to the next source", async () => {
    stubPerUrl({
      "api.coingecko.com": { ok: true, body: { "the-open-network": { usd: 4200 } } },
      "tonapi.io": { ok: true, body: { rates: { TON: { prices: { USD: 1.77 } } } } },
    });

    await expect(fetchTonPriceNow()).resolves.toBe(true);
    expect(getTonPrice()).toBe(1.77);
    expect(getLastPriceSource()).toBe("tonapi");
  });

  it("does not query later sources once one has answered", async () => {
    const fetchMock = stubPerUrl({
      "api.coingecko.com": { ok: true, body: { "the-open-network": { usd: 1.6 } } },
      "tonapi.io": { ok: true, body: { rates: { TON: { prices: { USD: 9.9 } } } } },
    });

    await fetchTonPriceNow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(getTonPrice()).toBe(1.6);
  });
});

describe("startPricePolling / stopPricePolling", () => {
  beforeEach(() => _resetForTest());
  afterEach(() => {
    stopPricePolling();
    vi.unstubAllGlobals();
  });

  it("triggers an immediate fetch on start", async () => {
    stubFetchOk(4.0);
    startPricePolling();
    await vi.waitFor(() => expect(getTonPrice()).toBe(4.0));
  });

  it("stopPricePolling clears the interval timer", () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ "the-open-network": { usd: 1.0 } }),
    }));

    startPricePolling();
    const countAfterStart = vi.getTimerCount();
    expect(countAfterStart).toBeGreaterThan(0);

    stopPricePolling();
    expect(vi.getTimerCount()).toBe(0);

    vi.useRealTimers();
  });
});
