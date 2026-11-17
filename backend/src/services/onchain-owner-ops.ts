import { createRequire } from "node:module";
import type { TonClient as TonClientType } from "@ton/ton";
import type { Address as AddressType } from "@ton/core";
import { getDeployerNetworkConfig } from "./deployer.js";
import { requireBuilders, StaleWrappersError } from "./wrapper-builders.js";

export { StaleWrappersError };

const WRAPPERS_DIR = new URL("../../../contracts/harmony/wrappers-ts/", import.meta.url).pathname;
const WRAPPERS_PATH = WRAPPERS_DIR + "dist/index.js";

const req = createRequire(WRAPPERS_DIR + "package.json");
const { TonClient } = req("@ton/ton") as { TonClient: typeof TonClientType };
const { Address, toNano, fromNano } = req("@ton/core") as {
  Address: typeof AddressType;
  toNano: (value: string | number) => bigint;
  fromNano: (value: bigint) => string;
};

const CLOSE_EMPTY_VALUE_GRAM = "0.05";
const MASTER_OP_VALUE_GRAM = "0.02";

const REFUND_BATCH_SIZE = 10;
const REFUND_BATCH_GAS_CENTIGRAM = 10;
const REFUND_USDT_LEG_CENTIGRAM = 5;
const REFUND_HEADROOM_CENTIGRAM = 10;

const STATUS_ACTIVE = 0;
const STATUS_REFUNDED = 2;
const STATUS_FROZEN = 3;

const GETTER_GAP_MS = 250;

const RETRY_DELAYS_MS = [700, 1500, 3000];

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function isRateLimited(err: unknown): boolean {
  const status = (err as { response?: { status?: number } })?.response?.status;
  return status === 429 || status === 500 || status === 503;
}

async function call<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= RETRY_DELAYS_MS.length || !isRateLimited(err)) throw err;
      await sleep(RETRY_DELAYS_MS[attempt]);
    }
  }
}

export function tonClientOptions(): { endpoint: string; apiKey: string | undefined } {
  const config = getDeployerNetworkConfig();
  return { endpoint: config.endpoint, apiKey: config.apiKey };
}

function client(): TonClientType {
  return new TonClient(tonClientOptions());
}

export function sameAddress(a: string, b: string): boolean {
  try {
    return Address.parse(a).equals(Address.parse(b));
  } catch {
    return false;
  }
}

function masterAddressString(): string {
  const addr = process.env.HARMONY_MASTER_ADDR;
  if (!addr) throw new Error("HARMONY_MASTER_ADDR not configured");
  return addr;
}

export function knownMasterAddresses(): string[] {
  const raw = process.env.HARMONY_MASTER_ADDRS ?? process.env.HARMONY_MASTER_ADDR;
  const list = (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (list.length === 0) throw new Error("HARMONY_MASTER_ADDR not configured");
  return list;
}

function isKnownMaster(addr: string): boolean {
  return knownMasterAddresses().some((m) => sameAddress(addr, m));
}

export interface MasterContext {
  network: string;
  masterAddress: string;
  owner: string;
  ownerRaw: string;
  deployerWallet: string | null;
  strayFunds: string;
  gasPool: string;
  campaignCount: number;
  explorerBase: string;
}

export async function getMasterContext(): Promise<MasterContext> {
  const { network, testOnly } = getDeployerNetworkConfig();
  const { HarmonyMaster } = await import(WRAPPERS_PATH);
  const master = client().open(HarmonyMaster.createFromAddress(Address.parse(masterAddressString())));

  const owner = (await call(() => master.getOwner())) as AddressType;
  await sleep(GETTER_GAP_MS);
  const strayFunds = (await call(() => master.getStrayFunds())) as bigint;
  await sleep(GETTER_GAP_MS);
  const gasPool = (await call(() => master.getGasPool())) as bigint;
  await sleep(GETTER_GAP_MS);
  const campaignCount = (await call(() => master.getCampaignCount())) as bigint;
  await sleep(GETTER_GAP_MS);
  const deployerWallet = (await call(() => master.getDeployerWallet())) as AddressType | null;

  return {
    network,
    masterAddress: Address.parse(masterAddressString()).toString({ testOnly }),
    owner: owner.toString({ testOnly }),
    ownerRaw: owner.toRawString(),
    deployerWallet: deployerWallet ? deployerWallet.toString({ testOnly }) : null,
    strayFunds: fromNano(strayFunds),
    gasPool: fromNano(gasPool),
    campaignCount: Number(campaignCount),
    explorerBase: testOnly ? "https://testnet.tonscan.org" : "https://tonscan.org",
  };
}

export interface OnchainCampaignState {
  campaignId: string;
  master: string;
  status: number;
  donorCount: number;
  raisedTon: string;
  raisedUsdt: string;
  goalTon: string;
  goalUsdt: string;
  deadline: number;
  balance: string;
}

export class CampaignContractGoneError extends Error {
  constructor(
    readonly onchainAddress: string,
    readonly accountState: string,
  ) {
    super(`Campaign contract is not active on chain (${accountState}): ${onchainAddress}`);
    this.name = "CampaignContractGoneError";
  }
}

export async function readCampaignState(onchainAddress: string): Promise<OnchainCampaignState> {
  const { HarmonyCampaign } = await import(WRAPPERS_PATH);
  const c = client();
  const addr = Address.parse(onchainAddress);
  const campaign = c.open(HarmonyCampaign.createFromAddress(addr));

  let fullStatus: unknown;
  try {
    fullStatus = await call(() => campaign.getFullStatus());
  } catch (err) {
    const { state } = await call(() => c.getContractState(addr));
    if (state !== "active") throw new CampaignContractGoneError(onchainAddress, state);
    throw err;
  }
  const full = fullStatus as {
    goalTon: bigint;
    goalUsdt: bigint;
    raisedTon: bigint;
    raisedUsdt: bigint;
    deadline: number;
    status: number;
    donorCount: number;
  };
  await sleep(GETTER_GAP_MS);
  const campaignId = (await call(() => campaign.getCampaignId())) as bigint;
  await sleep(GETTER_GAP_MS);
  const master = (await call(() => campaign.getMaster())) as AddressType;
  await sleep(GETTER_GAP_MS);
  const balance = await call(() => c.getBalance(addr));

  return {
    campaignId: campaignId.toString(),
    master: master.toString({ testOnly: getDeployerNetworkConfig().testOnly }),
    status: full.status,
    donorCount: full.donorCount,
    raisedTon: fromNano(full.raisedTon),
    raisedUsdt: (Number(full.raisedUsdt) / 1e6).toFixed(6),
    goalTon: fromNano(full.goalTon),
    goalUsdt: (Number(full.goalUsdt) / 1e6).toFixed(6),
    deadline: full.deadline,
    balance: fromNano(balance),
  };
}

export function closeEmptyRefusal(state: OnchainCampaignState): string | null {
  if (!isKnownMaster(state.master)) return "foreign_master";
  if (state.donorCount > 0 || parseFloat(state.raisedTon) > 0 || parseFloat(state.raisedUsdt) > 0) {
    return "campaign_not_empty";
  }
  if (state.deadline > Math.floor(Date.now() / 1000)) return "deadline_not_passed";
  if (state.status !== STATUS_ACTIVE && state.status !== STATUS_FROZEN) return "campaign_not_active";
  return null;
}

function tonApiBaseUrl(): string {
  if (process.env.TON_API_BASE_URL) return process.env.TON_API_BASE_URL.replace(/\/+$/, "");
  return process.env.TON_NETWORK === "mainnet" ? "https://tonapi.io" : "https://testnet.tonapi.io";
}

export async function campaignUsdtBalanceRaw(onchainAddress: string): Promise<bigint | null> {
  const jettonMaster = process.env.HARMONY_USDT_MASTER_ADDR;
  if (!jettonMaster) return null;
  try {
    const url =
      `${tonApiBaseUrl()}/v2/accounts/${encodeURIComponent(onchainAddress)}` +
      `/jettons/${encodeURIComponent(jettonMaster)}`;
    const res = await fetch(url);
    if (res.status === 404) return 0n;
    if (!res.ok) return null;
    const data = (await res.json()) as { balance?: string | number };
    if (data.balance === undefined || data.balance === null) return null;
    return BigInt(data.balance);
  } catch {
    return null;
  }
}

export async function accountIsDestroyed(onchainAddress: string): Promise<boolean | null> {
  try {
    const url = `${tonApiBaseUrl()}/v2/accounts/${encodeURIComponent(onchainAddress)}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as { status?: string };
    if (!data.status) return null;
    return data.status === "nonexist" || data.status === "uninit";
  } catch {
    return null;
  }
}

export async function closeEmptyRefusalWithJettons(
  state: OnchainCampaignState,
  onchainAddress: string,
): Promise<string | null> {
  const refusal = closeEmptyRefusal(state);
  if (refusal) return refusal;

  const usdt = await campaignUsdtBalanceRaw(onchainAddress);
  if (usdt === null) return "usdt_balance_unknown";
  if (usdt > 0n) return "campaign_holds_usdt";
  return null;
}

export function claimRefusal(state: OnchainCampaignState, attachedGram: string): string | null {
  if (state.status !== STATUS_ACTIVE) {
    if (state.status === STATUS_FROZEN) return "campaign_frozen";
    if (state.status === STATUS_REFUNDED) return "campaign_refunded";
    return "already_claimed";
  }

  const raisedTon = toNano(state.raisedTon);
  const raisedUsdt = BigInt(Math.round(parseFloat(state.raisedUsdt) * 1e6));
  const goalTon = toNano(state.goalTon);
  const goalUsdt = BigInt(Math.round(parseFloat(state.goalUsdt) * 1e6));

  if (raisedTon === 0n && raisedUsdt === 0n) return "nothing_raised";
  const goalReached =
    (goalUsdt > 0n && raisedUsdt >= goalUsdt) || (goalTon > 0n && raisedTon >= goalTon);
  const deadlinePassed = Math.floor(Date.now() / 1000) >= state.deadline;
  if (!goalReached && !deadlinePassed) return "fundraising_in_progress";

  let required = raisedTon + toNano("0.02");
  if (raisedUsdt > 0n) required += toNano("0.05");
  if (toNano(state.balance) + toNano(attachedGram) < required) return "insufficient_balance";

  return null;
}

export function refundOrderValueGram(state: OnchainCampaignState): number {
  const donors = Math.max(state.donorCount, 1);
  const batches = Math.ceil(donors / REFUND_BATCH_SIZE);
  const usdtLegs = parseFloat(state.raisedUsdt) > 0 ? donors : 0;
  const centigram =
    batches * REFUND_BATCH_GAS_CENTIGRAM +
    usdtLegs * REFUND_USDT_LEG_CENTIGRAM +
    REFUND_HEADROOM_CENTIGRAM;
  return centigram / 100;
}

export function refundRefusal(state: OnchainCampaignState): string | null {
  if (!sameAddress(state.master, masterAddressString())) return "foreign_master";
  if (state.status !== STATUS_FROZEN) return "campaign_not_frozen";
  if (state.donorCount === 0) return "nothing_to_refund";
  return null;
}

export type OwnerOp =
  | { op: "closeEmptyCampaign"; campaignId: string; masterAddress: string }
  | { op: "withdrawStrayFunds"; to: string }
  | { op: "addModerator"; addr: string }
  | { op: "removeModerator"; addr: string }
  | { op: "freezeCampaign"; campaignId: string }
  | { op: "unfreezeCampaign"; campaignId: string }
  | { op: "refundCampaign"; campaignId: string; valueGram: number }
  | { op: "extendCampaignDeadline"; campaignId: string; newDeadlineUnix: number };

export interface PreparedOp {
  to: string;
  amount: string;
  payload: string;
  summary: string;
}

export async function prepareOwnerOp(request: OwnerOp): Promise<PreparedOp> {
  const { testOnly } = getDeployerNetworkConfig();
  const {
    buildCloseEmptyCampaignMsg,
    buildWithdrawStrayFundsMsg,
    buildAddModeratorMsg,
    buildRemoveModeratorMsg,
    buildFreezeCampaignMsg,
    buildUnfreezeCampaignMsg,
    buildRefundCampaignMsg,
    buildExtendCampaignDeadlineMsg,
  } = requireBuilders(await import(WRAPPERS_PATH), [
    "buildCloseEmptyCampaignMsg",
    "buildWithdrawStrayFundsMsg",
    "buildAddModeratorMsg",
    "buildRemoveModeratorMsg",
    "buildFreezeCampaignMsg",
    "buildUnfreezeCampaignMsg",
    "buildRefundCampaignMsg",
    "buildExtendCampaignDeadlineMsg",
  ] as const);

  const to = Address.parse(masterAddressString()).toString({ testOnly, bounceable: true, urlSafe: true });

  switch (request.op) {
    case "closeEmptyCampaign": {
      const id = BigInt(request.campaignId);
      if (!isKnownMaster(request.masterAddress)) {
        throw new Error("closeEmptyCampaign: master is not one of HARMONY_MASTER_ADDRS");
      }
      const campaignMaster = Address.parse(request.masterAddress).toString({
        testOnly,
        bounceable: true,
        urlSafe: true,
      });
      return {
        to: campaignMaster,
        amount: toNano(CLOSE_EMPTY_VALUE_GRAM).toString(),
        payload: (buildCloseEmptyCampaignMsg(id) as { toBoc(): Buffer }).toBoc().toString("base64"),
        summary: `Закрыть пустую кампанию #${id} и вернуть её баланс деплой-кошельку`,
      };
    }
    case "withdrawStrayFunds": {
      const dest = Address.parse(request.to);
      return {
        to,
        amount: toNano(MASTER_OP_VALUE_GRAM).toString(),
        payload: (buildWithdrawStrayFundsMsg(dest) as { toBoc(): Buffer }).toBoc().toString("base64"),
        summary: `Вывести strayFunds на ${dest.toString({ testOnly })}`,
      };
    }
    case "addModerator": {
      const addr = Address.parse(request.addr);
      return {
        to,
        amount: toNano(MASTER_OP_VALUE_GRAM).toString(),
        payload: (buildAddModeratorMsg(addr) as { toBoc(): Buffer }).toBoc().toString("base64"),
        summary: `Выдать права модератора контракта ${addr.toString({ testOnly })}`,
      };
    }
    case "removeModerator": {
      const addr = Address.parse(request.addr);
      return {
        to,
        amount: toNano(MASTER_OP_VALUE_GRAM).toString(),
        payload: (buildRemoveModeratorMsg(addr) as { toBoc(): Buffer }).toBoc().toString("base64"),
        summary: `Отозвать права модератора контракта ${addr.toString({ testOnly })}`,
      };
    }
    case "freezeCampaign": {
      const id = BigInt(request.campaignId);
      return {
        to,
        amount: toNano(MASTER_OP_VALUE_GRAM).toString(),
        payload: (buildFreezeCampaignMsg(id) as { toBoc(): Buffer }).toBoc().toString("base64"),
        summary: `Заморозить кампанию #${id} в контракте — приём донатов прекратится`,
      };
    }
    case "unfreezeCampaign": {
      const id = BigInt(request.campaignId);
      return {
        to,
        amount: toNano(MASTER_OP_VALUE_GRAM).toString(),
        payload: (buildUnfreezeCampaignMsg(id) as { toBoc(): Buffer }).toBoc().toString("base64"),
        summary: `Разморозить кампанию #${id} — приём донатов возобновится`,
      };
    }
    case "refundCampaign": {
      const id = BigInt(request.campaignId);
      if (!(request.valueGram > 0)) throw new Error("refundCampaign requires a positive valueGram");
      return {
        to,
        amount: toNano(request.valueGram.toFixed(2)).toString(),
        payload: (buildRefundCampaignMsg(id) as { toBoc(): Buffer }).toBoc().toString("base64"),
        summary:
          `Вернуть все средства донорам кампании #${id}. ` +
          `Прикрепляется ${request.valueGram.toFixed(2)} GRAM на газ возврата; ` +
          `неизрасходованное вернётся при уничтожении кампании`,
      };
    }
    case "extendCampaignDeadline": {
      const id = BigInt(request.campaignId);
      const now = Math.floor(Date.now() / 1000);
      if (!Number.isInteger(request.newDeadlineUnix) || request.newDeadlineUnix <= now) {
        throw new Error("extendCampaignDeadline requires newDeadlineUnix in the future");
      }
      const when = new Date(request.newDeadlineUnix * 1000).toISOString().slice(0, 16).replace("T", " ");
      return {
        to,
        amount: toNano(MASTER_OP_VALUE_GRAM).toString(),
        payload: (
          buildExtendCampaignDeadlineMsg(id, request.newDeadlineUnix) as { toBoc(): Buffer }
        )
          .toBoc()
          .toString("base64"),
        summary: `Продлить срок кампании #${id} в контракте до ${when} UTC`,
      };
    }
  }
}
