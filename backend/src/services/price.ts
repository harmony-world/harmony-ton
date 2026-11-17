import { recordExternalDate } from "./clock-skew.js";

export const POLL_INTERVAL_MS = 5 * 60 * 1000;

const MIN_SANE_PRICE_USD = 0.01;
const MAX_SANE_PRICE_USD = 1000;

type PriceSource = {
  name: string;
  url: () => string;
  parse: (body: unknown) => number | undefined;
};

const SOURCES: PriceSource[] = [
  {
    name: "coingecko",
    url: () =>
      `${process.env.COINGECKO_API_URL ?? "https://api.coingecko.com/api/v3"}` +
      `/simple/price?ids=the-open-network&vs_currencies=usd`,
    parse: (b) => (b as { "the-open-network"?: { usd?: number } })["the-open-network"]?.usd,
  },
  {
    name: "tonapi",
    url: () => "https://tonapi.io/v2/rates?tokens=ton&currencies=usd",
    parse: (b) => (b as { rates?: { TON?: { prices?: { USD?: number } } } }).rates?.TON?.prices?.USD,
  },
  {
    name: "binance",
    url: () => "https://api.binance.com/api/v3/ticker/price?symbol=TONUSDT",
    parse: (b) => Number((b as { price?: string }).price),
  },
  {
    name: "coinbase",
    url: () => "https://api.coinbase.com/v2/prices/TON-USD/spot",
    parse: (b) => Number((b as { data?: { amount?: string } }).data?.amount),
  },
];

let lastPriceUsd = 0;
let lastFetchedAt = 0;
let lastSource = "";
let pollTimer: ReturnType<typeof setInterval> | null = null;

export function getTonPrice(): number {
  return lastPriceUsd;
}

export function getLastFetchedAt(): number {
  return lastFetchedAt;
}

export function getLastPriceSource(): string {
  return lastSource;
}

function isSane(value: number | undefined): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value > MIN_SANE_PRICE_USD &&
    value < MAX_SANE_PRICE_USD
  );
}

export async function fetchTonPriceNow(): Promise<boolean> {
  const failures: string[] = [];
  for (const source of SOURCES) {
    try {
      const res = await fetch(source.url());
      recordExternalDate(res.headers?.get("date"));
      if (!res.ok) {
        failures.push(`${source.name}=HTTP ${res.status}`);
        continue;
      }
      const usd = source.parse(await res.json());
      if (!isSane(usd)) {
        failures.push(`${source.name}=нечисловой ответ (${String(usd)})`);
        continue;
      }
      const switched = lastSource !== "" && lastSource !== source.name;
      lastPriceUsd = usd;
      lastFetchedAt = Date.now();
      lastSource = source.name;
      if (failures.length > 0) {
        console.warn(
          `[price] TON/USD получен из ${source.name} (${usd}); не ответили: ${failures.join(", ")}`,
        );
      } else if (switched) {
        console.warn(`[price] источник курса сменился на ${source.name} (${usd})`);
      }
      return true;
    } catch (err) {
      failures.push(`${source.name}=${err instanceof Error ? err.message : String(err)}`);
    }
  }
  console.error(
    `[price] ни один источник TON/USD не ответил: ${failures.join(", ")}. ` +
      `Последний известный курс ${lastPriceUsd} от ${lastFetchedAt > 0 ? new Date(lastFetchedAt).toISOString() : "никогда"}`,
  );
  return false;
}

export function startPricePolling(): void {
  void fetchTonPriceNow();
  pollTimer = setInterval(() => void fetchTonPriceNow(), POLL_INTERVAL_MS);
}

export function stopPricePolling(): void {
  if (pollTimer !== null) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

export function _resetForTest(): void {
  lastPriceUsd = 0;
  lastFetchedAt = 0;
  lastSource = "";
  if (pollTimer !== null) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}
