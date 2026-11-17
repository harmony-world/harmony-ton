import { buildApp } from "./app.js";
import { IndexerWorker } from "./indexer/worker.js";
import { fetchTonPriceNow, startPricePolling, getTonPrice } from "./services/price.js";
import { refreshEmojiStatusForUser } from "./services/emoji-status.js";
import { preloadModel as preloadNsfwModel } from "./services/nsfw-detector.js";
import { startScreeningProbe } from "./services/screening-probe.js";
import { migrateLegacyDocHashes } from "./services/kyc-privacy.js";
import { processDeadlineWarnings } from "./services/channel-autopost.js";
import { creatorMessenger, processExpenseReportCron } from "./services/expense-report-cron.js";

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "0.0.0.0";

const app = await buildApp();

process.on("unhandledRejection", (err) => {
  app.log.fatal(err, "unhandled rejection");
  process.exit(1);
});

try {
  await app.listen({ port, host });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

try {
  const upgraded = await migrateLegacyDocHashes(app.prisma);
  app.log.info({ event: "doc_hash_migrated", upgraded }, "legacy document fingerprints upgraded");
} catch (err) {
  app.log.error({ err, event: "doc_hash_migration_failed" }, "document fingerprint key missing or migration failed — KYC approvals will fail");
}

const masterAddrRaw = process.env.HARMONY_MASTER_ADDRS ?? process.env.HARMONY_MASTER_ADDR;
if (!masterAddrRaw) {
  app.log.error("HARMONY_MASTER_ADDRS or HARMONY_MASTER_ADDR must be set");
  process.exit(1);
}
const masterAddrs = masterAddrRaw
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const campaignAddrs = (process.env.HARMONY_CAMPAIGN_ADDRS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const indexer = new IndexerWorker(
  app.prisma,
  {
    contracts: [...masterAddrs, ...campaignAddrs],
    pollIntervalMs: Number(process.env.INDEXER_POLL_MS ?? 5_000),
    testnet: process.env.TON_NETWORK !== "mainnet",
    tonCenterApiKey: process.env.TON_CENTER_API_KEY,
    streamingEnabled: process.env.STREAMING_API_ENABLED === "true",
    streamingApiKey: process.env.STREAMING_API_KEY ?? process.env.TON_CENTER_API_KEY,
    onDonorDonationApplied: (userId) => {
      void refreshEmojiStatusForUser(app, userId);
    },
  },
  app.log as never,
);

try {
  for (let attempt = 0; attempt < 3; attempt++) {
    await fetchTonPriceNow();
    if (getTonPrice() > 0) break;
    if (attempt < 2) await new Promise((r) => setTimeout(r, 2000));
  }
  if (getTonPrice() <= 0) {
    app.log.error("TON price is 0 after 3 fetch attempts — USD conversion disabled until next successful fetch");
  }
  startPricePolling();
  await indexer.start();
  app.log.info("Indexer started alongside backend");
} catch (err) {
  app.log.error(err, "Indexer failed to start (backend continues)");
}

void preloadNsfwModel(app.log).then(() => startScreeningProbe(app.log));

const DEADLINE_CHECK_INTERVAL_MS = 60 * 60 * 1000;
const botToken = process.env.BOT_TOKEN;
if (botToken) {
  setInterval(() => {
    processDeadlineWarnings(app.prisma, botToken, app.log as never)
      .then((sent) => { if (sent > 0) app.log.info({ sent }, "deadline warnings sent"); })
      .catch((err) => app.log.error(err, "deadline warning cron failed"));
  }, DEADLINE_CHECK_INTERVAL_MS);
  app.log.info("Channel autopost deadline cron started (1h interval)");
}

const EXPENSE_REPORT_CRON_INTERVAL_MS = 6 * 60 * 60 * 1000;
const sendToCreator = creatorMessenger(app);
const runExpenseReportCron = () =>
  processExpenseReportCron({
    prisma: app.prisma,
    log: app.log as never,
    sendTelegramMessage: sendToCreator,
  }).catch((err) => app.log.error(err, "expense report cron failed"));

void runExpenseReportCron();
setInterval(runExpenseReportCron, EXPENSE_REPORT_CRON_INTERVAL_MS);
app.log.info("Expense report cron started (immediate run, then 6h interval)");
