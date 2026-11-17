import { PrismaClient } from "@prisma/client";
import pino from "pino";
import { IndexerWorker } from "./worker.js";
import { fetchTonPriceNow, startPricePolling, stopPricePolling, getTonPrice } from "../services/price.js";

const log = pino({ level: process.env.LOG_LEVEL ?? "info" });

const masterAddrRaw = process.env.HARMONY_MASTER_ADDRS ?? process.env.HARMONY_MASTER_ADDR;
if (!masterAddrRaw) {
  log.error("HARMONY_MASTER_ADDRS or HARMONY_MASTER_ADDR must be set");
  process.exit(1);
}
const MASTER_ADDRS = masterAddrRaw
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const CAMPAIGN_ADDRS = (process.env.HARMONY_CAMPAIGN_ADDRS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const prisma = new PrismaClient();

const worker = new IndexerWorker(
  prisma,
  {
    contracts: [...MASTER_ADDRS, ...CAMPAIGN_ADDRS],
    pollIntervalMs: Number(process.env.INDEXER_POLL_MS ?? 5_000),
    testnet: process.env.TON_NETWORK !== "mainnet",
    tonCenterApiKey: process.env.TON_CENTER_API_KEY,
    streamingEnabled: process.env.STREAMING_API_ENABLED === "true",
    streamingApiKey: process.env.STREAMING_API_KEY ?? process.env.TON_CENTER_API_KEY,
  },
  log
);

async function shutdown() {
  log.info("Shutting down indexer...");
  worker.stop();
  stopPricePolling();
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

try {
  for (let attempt = 0; attempt < 3; attempt++) {
    await fetchTonPriceNow();
    if (getTonPrice() > 0) break;
    if (attempt < 2) await new Promise((r) => setTimeout(r, 2000));
  }
  if (getTonPrice() <= 0) {
    log.error("TON price is 0 after 3 fetch attempts — USD conversion disabled until next successful fetch");
  }
  startPricePolling();
  await worker.start();
} catch (err) {
  log.error(err, "Indexer crashed");
  await prisma.$disconnect();
  process.exit(1);
}
