import { PrismaClient, type Prisma } from "@prisma/client";
import pino from "pino";
import { TonCenterClient, type TonTransaction } from "./ton-api.js";
import { OP } from "./parser.js";
import { normalizeTonAddress } from "../utils/ton-address.js";
import { StreamingClient } from "./streaming-client.js";
import {
  handleDonate,
  handleTransferNotification,
  handleClaimFreezeUnfreeze,
  handleRefundEvent,
  handleCampaignGasReturn,
  type ApplyEventDeps,
} from "./handlers.js";
import {
  closeExpiredCampaigns,
  closeGoalReachedCampaigns,
  loadWatchedAddresses,
  reconcileOnchain,
} from "./worker-maintenance.js";
import { pollIndexerContract, processIndexerTx } from "./worker-polling.js";
import { handleDeployCampaignEvent, verifyCampaignMaster } from "./worker-deploy.js";
import { markIndexerCycle, markIndexerStarted } from "./health.js";

export interface IndexerConfig {
  contracts: string[];
  pollIntervalMs?: number;
  testnet?: boolean;
  tonCenterApiKey?: string;
  streamingEnabled?: boolean;
  streamingApiKey?: string;
  onDonorDonationApplied?: (userId: string) => void;
}

const RECOVERY_POLL_INTERVAL_MS = 60_000;
const RECONCILIATION_INTERVAL_MS = 10 * 60 * 1000;
const WATCHED_ADDRESS_POLL_SPACING_MS = 1_500;

export class IndexerWorker {
  private readonly prisma: PrismaClient;
  private readonly client: TonCenterClient;
  private readonly watchSet: Set<string>;
  private readonly pollIntervalMs: number;
  private readonly recoveryPollIntervalMs = RECOVERY_POLL_INTERVAL_MS;
  private readonly testnet: boolean;
  private readonly log: pino.Logger;
  private readonly onDonorDonationApplied?: (userId: string) => void;
  private readonly streamingEnabled: boolean;
  private streamingClient: StreamingClient | null = null;
  private running = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastReconciliationAt = 0;

  constructor(prisma: PrismaClient, config: IndexerConfig, log?: pino.Logger) {
    this.prisma = prisma;
    this.testnet = config.testnet ?? true;
    this.watchSet = new Set(config.contracts.map((a) => this.toFriendly(a)));
    this.pollIntervalMs = config.pollIntervalMs ?? 5_000;
    this.streamingEnabled = config.streamingEnabled ?? false;
    this.client = new TonCenterClient({
      testnet: this.testnet,
      apiKey: config.tonCenterApiKey,
    });
    this.log = log ?? pino({ level: "info" });
    this.onDonorDonationApplied = config.onDonorDonationApplied;

    const streamingKey = config.streamingApiKey ?? config.tonCenterApiKey;
    if (this.streamingEnabled && streamingKey) {
      this.streamingClient = new StreamingClient(
        {
          testnet: this.testnet,
          apiKey: streamingKey,
          minFinality: "confirmed",
        },
        (accountAddr, tx, finality) => this.handleStreamingTx(accountAddr, tx, finality),
        this.log,
      );
    } else if (this.streamingEnabled && !streamingKey) {
      this.log.warn("Streaming API enabled but no API key set — falling back to polling");
    }
  }

  async start(): Promise<void> {
    await this.loadWatchedAddresses();
    await this.closeExpiredCampaigns();
    await this.closeGoalReachedCampaigns();
    this.running = true;
    markIndexerStarted();

    if (this.streamingClient) {
      this.log.info(
        { contracts: [...this.watchSet], mode: "hybrid" },
        "Indexer started (streaming + recovery polling)",
      );
      void this.streamingClient.subscribe([...this.watchSet]).catch((err) => {
        this.log.error({ err }, "StreamingClient: subscribe failed");
      });
    } else {
      this.log.info(
        { contracts: [...this.watchSet], mode: "polling" },
        "Indexer started (polling only)",
      );
    }

    await this.poll();
  }

  stop(): void {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.streamingClient) {
      this.streamingClient.stop();
    }
    this.log.info("Indexer stopped");
  }

  hasContract(addr: string): boolean {
    return this.watchSet.has(this.toFriendly(addr));
  }

  private toFriendly(addr: string): string {
    return normalizeTonAddress(addr, this.testnet);
  }

  private async loadWatchedAddresses(): Promise<void> {
    await loadWatchedAddresses({
      prisma: this.prisma,
      watchSet: this.watchSet,
      toFriendly: (addr) => this.toFriendly(addr),
      log: this.log,
    });
  }

  async addCampaign(addr: string): Promise<void> {
    const friendly = this.toFriendly(addr);
    if (this.watchSet.has(friendly)) return;
    this.watchSet.add(friendly);
    await this.prisma.indexerCursor.upsert({
      where: { contractAddr: friendly },
      create: { contractAddr: friendly },
      update: {},
    });
    this.log.info({ addr: friendly }, "Campaign added to watch list");
    if (this.streamingClient) {
      this.streamingClient.updateAddresses([...this.watchSet]);
    }
  }

  private async verifyCampaignMaster(campaignAddr: string, expectedMaster: string): Promise<boolean | null> {
    return verifyCampaignMaster({
      client: this.client,
      campaignAddr,
      expectedMaster,
      testnet: this.testnet,
      toFriendly: (addr) => this.toFriendly(addr),
      log: this.log,
    });
  }

  private get effectivePollIntervalMs(): number {
    if (this.streamingClient?.connected) {
      return this.recoveryPollIntervalMs;
    }
    return this.pollIntervalMs;
  }

  private schedule(): void {
    if (!this.running) return;
    this.timer = setTimeout(() => this.poll(), this.effectivePollIntervalMs);
  }

  private async poll(): Promise<void> {
    const isRecovery = this.streamingClient?.connected ?? false;
    if (isRecovery) {
      this.log.debug(
        { intervalMs: this.recoveryPollIntervalMs, watchCount: this.watchSet.size },
        "Recovery poll (streaming active)",
      );
    }

    let failures = 0;
    for (const addr of this.watchSet) {
      try {
        await this.pollContract(addr);
      } catch (err) {
        failures += 1;
        this.log.error({ addr, err }, "Poll failed");
      }
      await new Promise((r) => setTimeout(r, WATCHED_ADDRESS_POLL_SPACING_MS));
    }
    markIndexerCycle(this.watchSet.size, failures);
    await this.closeExpiredCampaigns();
    if (Date.now() - this.lastReconciliationAt > RECONCILIATION_INTERVAL_MS) {
      await this.reconcileOnchain();
    }
    this.schedule();
  }

  private async reconcileOnchain(): Promise<void> {
    this.lastReconciliationAt = Date.now();
    await reconcileOnchain({ prisma: this.prisma, client: this.client, log: this.log });
  }

  private async closeExpiredCampaigns(): Promise<void> {
    await closeExpiredCampaigns(this.prisma, this.log);
  }

  private async closeGoalReachedCampaigns(): Promise<void> {
    await closeGoalReachedCampaigns(this.prisma, this.log);
  }

  async pollContract(addr: string): Promise<void> {
    await pollIndexerContract(this.pollingDeps, addr);
  }

  private get eventDeps(): ApplyEventDeps {
    return {
      prisma: this.prisma,
      log: this.log,
      testnet: this.testnet,
      toFriendly: (addr: string) => this.toFriendly(addr),
    };
  }

  private get pollingDeps() {
    return {
      prisma: this.prisma,
      client: this.client,
      log: this.log,
      applyEvent: (tx: Prisma.TransactionClient, contractAddr: string, op: number, raw: TonTransaction) =>
        this.applyEvent(tx, contractAddr, op, raw),
      onDonorDonationApplied: this.onDonorDonationApplied,
    };
  }

  private async applyEvent(
    tx: Prisma.TransactionClient,
    contractAddr: string,
    op: number,
    raw: TonTransaction
  ): Promise<{ donationApplied: boolean; donorLinked: boolean; donorUserId?: string | null }> {
    const deps = this.eventDeps;

    if (op === OP.Donate) {
      return handleDonate(tx, deps, contractAddr, raw);
    }

    if (op === OP.TransferNotification) {
      return handleTransferNotification(tx, deps, contractAddr, raw);
    }

    if (op === OP.Claim || op === OP.Freeze || op === OP.Unfreeze) {
      return handleClaimFreezeUnfreeze(tx, deps, contractAddr, op, raw);
    }

    if (op === OP.RefundBatch || op === OP.CampaignRefunded) {
      return handleRefundEvent(tx, deps, contractAddr, op, raw);
    }

    if (op === OP.CampaignGasReturn) {
      return handleCampaignGasReturn(tx, deps, contractAddr, raw);
    }

    if (op === OP.DeployCampaign) {
      await handleDeployCampaignEvent({
        client: this.client,
        contractAddr,
        raw,
        testnet: this.testnet,
        toFriendly: (addr) => this.toFriendly(addr),
        verifyCampaignMaster: (campaignAddr, expectedMaster) => this.verifyCampaignMaster(campaignAddr, expectedMaster),
        addCampaign: (addr) => this.addCampaign(addr),
        log: this.log,
      });
    }
    return { donationApplied: false, donorLinked: false, donorUserId: null };
  }

  private async handleStreamingTx(
    accountAddr: string,
    tx: TonTransaction,
    finality: string,
  ): Promise<void> {
    const friendly = this.toFriendly(accountAddr);
    if (!this.watchSet.has(friendly)) return;

    this.log.debug(
      { addr: friendly, txHash: tx.hash, lt: tx.lt, finality },
      "Streaming: transaction received",
    );

    const result = await processIndexerTx(this.pollingDeps, friendly, tx);
    if (result.eventCreated) {
      const newLt = BigInt(tx.lt);
      const currentCursor = await this.prisma.indexerCursor.findUnique({
        where: { contractAddr: friendly },
        select: { lastLt: true },
      });
      if (!currentCursor || newLt > BigInt(currentCursor.lastLt)) {
        await this.prisma.indexerCursor.upsert({
          where: { contractAddr: friendly },
          create: { contractAddr: friendly, lastLt: newLt, lastTxHash: tx.hash },
          update: { lastLt: newLt, lastTxHash: tx.hash },
        });
      }
      this.log.info(
        { addr: friendly, txHash: tx.hash, finality, source: "streaming" },
        "Streaming: event processed",
      );
    }
  }
}
