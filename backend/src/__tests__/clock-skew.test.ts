import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  recordExternalDate,
  getClockSkewMs,
  getClockSkewCheckedAt,
  _resetForTest,
} from "../services/clock-skew.js";
import { fetchTonPriceNow, _resetForTest as _resetPrice } from "../services/price.js";
import Fastify from "fastify";
import { healthRoutes } from "../routes/health.js";

const EXTERNAL = "Tue, 29 Sep 2026 16:00:00 GMT";
const EXTERNAL_MS = Date.parse(EXTERNAL);

describe("clock skew — measurement", () => {
  beforeEach(() => _resetForTest());

  it("is unmeasured before any external response", () => {
    expect(getClockSkewMs()).toBeNull();
    expect(getClockSkewCheckedAt()).toBe(0);
  });

  it("reports a positive skew when our clock runs ahead", () => {
    recordExternalDate(EXTERNAL, EXTERNAL_MS + 45_000);
    expect(getClockSkewMs()).toBe(45_000);
  });

  it("reports a negative skew when our clock runs behind", () => {
    recordExternalDate(EXTERNAL, EXTERNAL_MS - 45_000);
    expect(getClockSkewMs()).toBe(-45_000);
  });

  it("records when the measurement was taken", () => {
    recordExternalDate(EXTERNAL, EXTERNAL_MS);
    expect(getClockSkewCheckedAt()).toBe(EXTERNAL_MS);
  });

  it("stays unmeasured when the header is absent", () => {
    recordExternalDate(null);
    recordExternalDate(undefined);
    recordExternalDate("");
    expect(getClockSkewMs()).toBeNull();
  });

  it("stays unmeasured when the header is unparseable", () => {
    recordExternalDate("not a date");
    expect(getClockSkewMs()).toBeNull();
  });

  it("keeps the previous measurement when a later header is unusable", () => {
    recordExternalDate(EXTERNAL, EXTERNAL_MS + 10_000);
    recordExternalDate("garbage");
    expect(getClockSkewMs()).toBe(10_000);
  });
});

describe("clock skew — fed by the price poll", () => {
  beforeEach(() => {
    _resetForTest();
    _resetPrice();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("measures skew from a successful price response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ date: EXTERNAL }),
        json: async () => ({ "the-open-network": { usd: 1.58 } }),
      }),
    );
    vi.setSystemTime(new Date(EXTERNAL_MS + 40_000));

    await fetchTonPriceNow();

    expect(getClockSkewMs()).toBe(40_000);
    vi.useRealTimers();
  });

  it("measures skew from a rejected price response too", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        headers: new Headers({ date: EXTERNAL }),
      }),
    );
    vi.setSystemTime(new Date(EXTERNAL_MS - 40_000));

    await fetchTonPriceNow();

    expect(getClockSkewMs()).toBe(-40_000);
    vi.useRealTimers();
  });
});

describe("clock skew — exposed on /health", () => {
  beforeEach(() => _resetForTest());

  it("reports null until a measurement exists", async () => {
    const app = Fastify();
    await app.register(healthRoutes);
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.json().clock).toEqual({ skewMs: null, checkedAt: null });
    await app.close();
  });

  it("reports the measured skew and when it was taken", async () => {
    recordExternalDate(EXTERNAL, EXTERNAL_MS + 1_500);
    const app = Fastify();
    await app.register(healthRoutes);
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.json().clock).toEqual({
      skewMs: 1_500,
      checkedAt: new Date(EXTERNAL_MS + 1_500).toISOString(),
    });
    await app.close();
  });
});
