import { createRequire } from "node:module";
import { readFileSync, existsSync, statSync } from "node:fs";
import { getTonPrice, getLastFetchedAt, fetchTonPriceNow } from "./price.js";
import type { TonClient as TonClientType } from "@ton/ton";
import type { WalletContractV5R1 as WalletContractV5R1Type } from "@ton/ton";
import type { JettonMaster as JettonMasterType } from "@ton/ton";
import type { Address as AddressType, MessageRelaxed } from "@ton/core";
import { SendMode } from "@ton/core";

const WRAPPERS_DIR = new URL("../../../contracts/harmony/wrappers-ts/", import.meta.url).pathname;
const WRAPPERS_PATH = WRAPPERS_DIR + "dist/index.js";

const req = createRequire(WRAPPERS_DIR + "package.json");
const { TonClient, WalletContractV5R1 } = req("@ton/ton") as {
  TonClient: typeof TonClientType;
  WalletContractV5R1: typeof WalletContractV5R1Type;
};
const { mnemonicToPrivateKey } = req("@ton/crypto") as {
  mnemonicToPrivateKey: (mnemonic: string[]) => Promise<{ publicKey: Buffer; secretKey: Buffer }>;
};
const { Address, toNano, internal, fromNano } = req("@ton/core") as {
  Address: typeof AddressType;
  toNano: (value: string | number) => bigint;
  internal: (params: { to: AddressType; value: bigint; body: unknown }) => MessageRelaxed;
  fromNano: (value: bigint) => string;
};

const TONCENTER_V2_ENDPOINTS = {
  mainnet: "https://toncenter.com/api/v2/jsonRPC",
  testnet: "https://testnet.toncenter.com/api/v2/jsonRPC",
} as const;

const NETWORK_GLOBAL_IDS = {
  mainnet: -239,
  testnet: -3,
} as const;
const BALANCE_RETRY_COUNT = 3;
const BALANCE_RETRY_DELAY_MS = 1_500;
const SEQNO_CONFIRM_TIMEOUT_MS = 120_000;
const SEQNO_CONFIRM_POLL_MS = 5_000;
const DEPLOY_REGISTRY_CONFIRM_TIMEOUT_MS = 30_000;
const DEPLOY_REGISTRY_CONFIRM_POLL_MS = 3_000;
const USDT_WALLET_RESOLVE_RETRIES = 3;

type TonNetwork = keyof typeof TONCENTER_V2_ENDPOINTS;

function getTonNetwork(): TonNetwork {
  const network = process.env.TON_NETWORK ?? "testnet";
  if (network !== "mainnet" && network !== "testnet") {
    throw new Error(`Unsupported TON_NETWORK: ${network}`);
  }
  return network;
}

function assertMainnetMnemonicSource(network: TonNetwork, mnemonicFile?: string): void {
  if (network !== "mainnet") return;
  if (process.env.DEPLOYER_MNEMONIC) {
    throw new Error("DEPLOYER_MNEMONIC env is forbidden on mainnet; use DEPLOYER_MNEMONIC_FILE");
  }
  if (!mnemonicFile) {
    throw new Error("DEPLOYER_MNEMONIC_FILE is required on mainnet");
  }
  const mode = statSync(mnemonicFile).mode & 0o777;
  if (mode !== 0o600) {
    throw new Error("DEPLOYER_MNEMONIC_FILE must have 0600 permissions on mainnet");
  }
}

export function getDeployerNetworkConfig() {
  const network = getTonNetwork();
  const endpoint = process.env.TON_CENTER_V2_ENDPOINT ?? TONCENTER_V2_ENDPOINTS[network];
  const networkGlobalId = Number(
    process.env.TON_WALLET_NETWORK_GLOBAL_ID ?? NETWORK_GLOBAL_IDS[network],
  );

  if (!Number.isInteger(networkGlobalId)) {
    throw new Error("TON_WALLET_NETWORK_GLOBAL_ID must be an integer");
  }
  if (network === "mainnet" && /testnet/i.test(endpoint)) {
    throw new Error("TON_NETWORK=mainnet cannot use a testnet TonCenter endpoint");
  }

  return {
    network,
    endpoint,
    networkGlobalId,
    testOnly: network !== "mainnet",
    apiKey: process.env.TON_CENTER_API_KEY || undefined,
  };
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function retry<T>(fn: () => Promise<T>, retries = 5, delayMs = 2000): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i < retries - 1) {
        await sleep(delayMs);
        delayMs *= 1.5;
        continue;
      }
      throw e;
    }
  }
  throw new Error("unreachable");
}

interface DeployResult {
  onchainAddress: string;
}

export class DeployerLowBalanceError extends Error {
  readonly address: string;
  readonly balanceNano: bigint;
  readonly minBalanceNano: bigint;

  constructor(opts: { address: string; balanceNano: bigint; minBalanceNano: bigint }) {
    const balanceGram = fromNano(opts.balanceNano);
    const minBalanceGram = fromNano(opts.minBalanceNano);
    super(`DEPLOYER_LOW_BALANCE:${balanceGram}:min:${minBalanceGram}`);
    this.name = "DeployerLowBalanceError";
    this.address = opts.address;
    this.balanceNano = opts.balanceNano;
    this.minBalanceNano = opts.minBalanceNano;
  }

  get balanceGram(): string {
    return fromNano(this.balanceNano);
  }

  get minBalanceGram(): string {
    return fromNano(this.minBalanceNano);
  }
}

export async function getDeployerInfo(): Promise<{ address: string; balanceTon: string } | null> {
  try {
    const networkConfig = getDeployerNetworkConfig();
    const mnemonicFile = process.env.DEPLOYER_MNEMONIC_FILE;
    let mnemonic: string | undefined;
    if (mnemonicFile && existsSync(mnemonicFile)) {
      mnemonic = readFileSync(mnemonicFile, "utf-8").trim();
    } else {
      mnemonic = process.env.DEPLOYER_MNEMONIC;
    }
    if (!mnemonic) return null;

    const keyPair = await mnemonicToPrivateKey(mnemonic.split(" "));
    const wallet = WalletContractV5R1.create({
      publicKey: keyPair.publicKey,
      walletId: {
        networkGlobalId: networkConfig.networkGlobalId,
        context: { workchain: 0, walletVersion: "v5r1", subwalletNumber: 0 },
      },
    });
    const address = wallet.address.toString({ testOnly: networkConfig.testOnly });

    const client = new TonClient({
      endpoint: networkConfig.endpoint,
      apiKey: networkConfig.apiKey,
    });
    const balanceNano = await retry(() => client.getBalance(wallet.address), 2, 1000);
    return { address, balanceTon: fromNano(balanceNano) };
  } catch {
    return null;
  }
}

export class DeployNotSentError extends Error {
  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause), { cause });
    this.name = "DeployNotSentError";
  }
}

type DeployCampaignOpts = {
  payoutAddress: string;
  goalAmountUsd: number;
  deadlineUnix: number;
};

export async function deployCampaignOnchain(opts: DeployCampaignOpts): Promise<DeployResult> {
  const progress = { sent: false };
  try {
    return await deployCampaignOnchainSteps(opts, progress);
  } catch (err) {
    if (progress.sent || err instanceof DeployerLowBalanceError) throw err;
    throw new DeployNotSentError(err);
  }
}

async function deployCampaignOnchainSteps(
  opts: DeployCampaignOpts,
  progress: { sent: boolean },
): Promise<DeployResult> {
  const networkConfig = getDeployerNetworkConfig();
  const mnemonicFile = process.env.DEPLOYER_MNEMONIC_FILE;
  let mnemonic: string | undefined;
  if (mnemonicFile) {
    if (!existsSync(mnemonicFile)) {
      throw new Error(`DEPLOYER_MNEMONIC_FILE not found: ${mnemonicFile}`);
    }
    assertMainnetMnemonicSource(networkConfig.network, mnemonicFile);
    mnemonic = readFileSync(mnemonicFile, "utf-8").trim();
  } else {
    assertMainnetMnemonicSource(networkConfig.network, mnemonicFile);
    mnemonic = process.env.DEPLOYER_MNEMONIC;
  }
  const masterAddrStr = process.env.HARMONY_MASTER_ADDR;
  if (!mnemonic || !masterAddrStr) {
    throw new Error("DEPLOYER_MNEMONIC or HARMONY_MASTER_ADDR not configured");
  }

  const { HarmonyMaster, buildDeployCampaignMsg, buildSetCampaignUsdtWalletMsg } = await import(WRAPPERS_PATH);

  const client = new TonClient({
    endpoint: networkConfig.endpoint,
    apiKey: networkConfig.apiKey,
  });
  const keyPair = await mnemonicToPrivateKey(mnemonic.split(" "));
  const wallet = WalletContractV5R1.create({
    publicKey: keyPair.publicKey,
    walletId: {
      networkGlobalId: networkConfig.networkGlobalId,
      context: { workchain: 0, walletVersion: "v5r1", subwalletNumber: 0 },
    },
  });
  const walletContract = client.open(wallet);
  const deployerAddress = wallet.address.toString({ testOnly: networkConfig.testOnly });
  const minBalanceNano = toNano(process.env.DEPLOYER_MIN_BALANCE_GRAM ?? "2");
  const balanceNano: bigint = await retry(
    () => client.getBalance(wallet.address),
    BALANCE_RETRY_COUNT,
    BALANCE_RETRY_DELAY_MS,
  );
  if (balanceNano < minBalanceNano) {
    throw new DeployerLowBalanceError({ address: deployerAddress, balanceNano, minBalanceNano });
  }

  const masterAddr = Address.parse(masterAddrStr);
  const deployTransferValue = process.env.DEPLOYER_DEPLOY_VALUE_GRAM ?? "0.15";

  const master = HarmonyMaster.createFromAddress(masterAddr);
  const masterContract = client.open(master);
  const countBefore: bigint = await retry(() => masterContract.getCampaignCount());

  const usdtMasterAddrStr = process.env.HARMONY_USDT_MASTER_ADDR;
  if (!usdtMasterAddrStr) {
    throw new Error("HARMONY_USDT_MASTER_ADDR not configured");
  }
  const usdtMasterAddress = Address.parse(usdtMasterAddrStr);

  const platformWalletStr = process.env.HARMONY_PLATFORM_WALLET;
  if (!platformWalletStr) {
    throw new Error("HARMONY_PLATFORM_WALLET not configured — tips destination unknown");
  }
  const platformWalletAddress = Address.parse(platformWalletStr);

  if (getTonNetwork() === "mainnet" && platformWalletAddress.equals(wallet.address)) {
    throw new Error("HARMONY_PLATFORM_WALLET must not equal deployer wallet on mainnet");
  }

  const recipient = Address.parse(opts.payoutAddress);
  const goalUsdt = BigInt(Math.round(opts.goalAmountUsd * 1e6));
  const maxPriceAgeMs = 10 * 60 * 1000;
  const priceIsStale = () => getTonPrice() <= 0 || Date.now() - getLastFetchedAt() > maxPriceAgeMs;
  if (priceIsStale()) {
    await fetchTonPriceNow();
  }
  const tonUsdRate = getTonPrice();
  const priceAgeMs = Date.now() - getLastFetchedAt();
  if (priceIsStale()) {
    throw new Error(
      `TON/USD price unavailable or stale (price=${tonUsdRate}, age=${Math.round(priceAgeMs / 1000)}s, max=${maxPriceAgeMs / 1000}s)`,
    );
  }
  const goalTon = toNano((opts.goalAmountUsd / tonUsdRate).toFixed(9));

  const deployValueNano = toNano(process.env.DEPLOYER_DEPLOY_FEE_GRAM ?? deployTransferValue);
  const body = buildDeployCampaignMsg({
    recipient,
    goalUsdt,
    goalTon,
    deadline: opts.deadlineUnix,
    deployValue: deployValueNano,
    usdtConfig: {
      usdtMasterAddress,
      usdtJettonWallet: usdtMasterAddress,
      platformWallet: platformWalletAddress,
    },
  });

  await sleep(2000);
  const seqno: number = await retry(() => walletContract.getSeqno());

  progress.sent = true;
  await retry(() =>
    walletContract.sendTransfer({
      seqno,
      secretKey: keyPair.secretKey,
      sendMode: SendMode.PAY_GAS_SEPARATELY | SendMode.IGNORE_ERRORS,
      messages: [internal({ to: masterAddr, value: toNano(deployTransferValue), body })],
    }),
  );

  let seqnoConfirmed = false;
  let lastSeqnoError: unknown = null;
  const seqnoStart = Date.now();
  while (Date.now() - seqnoStart < SEQNO_CONFIRM_TIMEOUT_MS) {
    await sleep(SEQNO_CONFIRM_POLL_MS);
    try {
      const cur = await walletContract.getSeqno();
      if (cur > seqno) { seqnoConfirmed = true; break; }
    } catch (err) {
      lastSeqnoError = err;
      await sleep(DEPLOY_REGISTRY_CONFIRM_POLL_MS);
    }
  }
  if (!seqnoConfirmed) {
    throw new Error(
      `DEPLOY_TX_EXPIRED: seqno did not increment within 120s — transaction likely expired; last error: ${
        lastSeqnoError instanceof Error ? lastSeqnoError.message : "none"
      }`,
    );
  }

  let countConfirmed = false;
  let lastRegistryError: unknown = null;
  const countStart = Date.now();
  while (Date.now() - countStart < DEPLOY_REGISTRY_CONFIRM_TIMEOUT_MS) {
    await sleep(DEPLOY_REGISTRY_CONFIRM_POLL_MS);
    try {
      const countAfter: bigint = await masterContract.getCampaignCount();
      if (countAfter > countBefore) { countConfirmed = true; break; }
    } catch (err) {
      lastRegistryError = err;
    }
  }
  if (!countConfirmed) {
    throw new Error(
      `DEPLOY_CAMPAIGN_NOT_REGISTERED: campaignCount did not increment within 30s after seqno confirmation; last error: ${
        lastRegistryError instanceof Error ? lastRegistryError.message : "none"
      }`,
    );
  }

  const campaignAddr = await retry(() => masterContract.getCampaign(countBefore)) as AddressType;
  const campaignAddrStr = campaignAddr.toString({ testOnly: networkConfig.testOnly });

  try {
    const jettonWalletAddr = await retry(
      () => resolveJettonWallet(client, campaignAddr, usdtMasterAddress),
      USDT_WALLET_RESOLVE_RETRIES,
      DEPLOY_REGISTRY_CONFIRM_POLL_MS,
    );
    const setWalletBody = buildSetCampaignUsdtWalletMsg(countBefore, jettonWalletAddr);
    await sleep(DEPLOY_REGISTRY_CONFIRM_POLL_MS);
    const seqno2: number = await retry(() => walletContract.getSeqno());
    await retry(() =>
      walletContract.sendTransfer({
        seqno: seqno2,
        secretKey: keyPair.secretKey,
        sendMode: SendMode.PAY_GAS_SEPARATELY | SendMode.IGNORE_ERRORS,
        messages: [internal({ to: masterAddr, value: toNano("0.1"), body: setWalletBody })],
      }),
    );
  } catch (err) {
    console.error(
      "[deployer] USDT jetton wallet resolution failed — campaign accepts only TON donations until resolved",
      { onchainAddress: campaignAddrStr, err },
    );
  }

  return { onchainAddress: campaignAddrStr };
}

async function resolveJettonWallet(
  client: TonClientType,
  ownerAddr: AddressType,
  jettonMasterAddr: AddressType,
): Promise<AddressType> {
  const { JettonMaster } = req("@ton/ton") as { JettonMaster: typeof JettonMasterType };
  const jm = client.open(JettonMaster.create(jettonMasterAddr));
  const walletAddr = await jm.getWalletAddress(ownerAddr);
  if (!walletAddr) {
    throw new Error(`Failed to resolve jetton wallet for ${ownerAddr} from ${jettonMasterAddr}`);
  }
  return walletAddr;
}
