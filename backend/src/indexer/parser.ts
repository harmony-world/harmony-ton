import { Cell } from "@ton/core";

export const OP = {
  Donate: 0x10000001,
  Claim: 0x10000002,
  Refund: 0x10000003,
  Freeze: 0x10000004,
  Unfreeze: 0x10000005,
  SetUsdtJettonWallet: 0x10000006,
  RefundBatch: 0x10000008,
  DeployCampaign: 0x20000001,
  WithdrawStrayFunds: 0x20000002,
  AddModerator: 0x20000003,
  RemoveModerator: 0x20000004,
  SetCampaignUsdtWallet: 0x20000005,
  CampaignGasReturn: 0x20000006,
  RefillDeployer: 0x20000007,
  SetCampaignCode: 0x20000008,
  SetDeployerWallet: 0x20000009,
  CampaignRefunded: 0x2000000e,
  TransferNotification: 0x7362d09c,
} as const;

export type OpName = keyof typeof OP;

export interface ParsedMessage {
  op: number;
  opName: OpName | "unknown";
}

const OP_REVERSE = Object.fromEntries(
  Object.entries(OP).map(([k, v]) => [v, k as OpName])
) as Record<number, OpName>;

export function parseOpCode(bocBase64: string): ParsedMessage | null {
  let cell: Cell;
  try {
    cell = Cell.fromBase64(bocBase64);
  } catch {
    return null;
  }
  try {
    const slice = cell.beginParse();
    if (slice.remainingBits < 32) return null;
    const op = slice.loadUint(32);
    return { op, opName: OP_REVERSE[op] ?? "unknown" };
  } catch {
    return null;
  }
}

export function parseDonateBody(bocBase64: string): { tipBps: number } | null {
  try {
    const cell = Cell.fromBase64(bocBase64);
    const slice = cell.beginParse();
    if (slice.remainingBits < 64) return null;
    const op = slice.loadUint(32);
    if (op !== OP.Donate) return null;
    const tipBps = slice.loadUint(32);
    return { tipBps };
  } catch {
    return null;
  }
}

function parseTipBpsFromForwardPayload(slice: ReturnType<Cell["beginParse"]>): number | null {
  try {
    if (slice.remainingBits < 1) return null;
    const payload = slice.loadBoolean() ? slice.loadRef().beginParse() : slice;
    if (payload.remainingBits < 64) return null;
    const op = payload.loadUint(32);
    if (op !== OP.Donate) return null;
    return payload.loadUint(32);
  } catch {
    return null;
  }
}

export function parseTransferNotificationBody(
  bocBase64: string,
): { amount: bigint; sender: string; tipBps: number | null } | null {
  try {
    const cell = Cell.fromBase64(bocBase64);
    const slice = cell.beginParse();
    if (slice.remainingBits < 32 + 64) return null;
    const op = slice.loadUint(32);
    if (op !== OP.TransferNotification) return null;
    slice.loadUintBig(64);
    const amount = slice.loadCoins();
    const sender = slice.loadAddress().toString();
    const tipBps = parseTipBpsFromForwardPayload(slice);
    return { amount, sender, tipBps };
  } catch {
    return null;
  }
}

export function opToEventType(op: number): string | null {
  const name = OP_REVERSE[op];
  if (!name) return null;
  return name
    .replace(/([A-Z])/g, "_$1")
    .toUpperCase()
    .replace(/^_/, "");
}
