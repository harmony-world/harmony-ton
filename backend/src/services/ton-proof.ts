import crypto from "node:crypto";
import { signVerify } from "@ton/crypto";
import {
  Address,
  Cell,
  Slice,
  StateInit,
  WalletContractV1R1,
  WalletContractV1R2,
  WalletContractV1R3,
  WalletContractV2R1,
  WalletContractV2R2,
  WalletContractV3R1,
  WalletContractV3R2,
  WalletContractV4,
  WalletContractV5R1,
  contractAddress,
  loadStateInit,
} from "@ton/ton";

const TON_PROOF_PREFIX = "ton-proof-item-v2/";
const TON_CONNECT_PREFIX = "ton-connect";
const PROOF_MAX_AGE_SECONDS = parseInt(process.env.WALLET_PROOF_MAX_AGE_SECONDS ?? "900", 10);
const CHALLENGE_TTL_MS = parseInt(process.env.WALLET_PROOF_CHALLENGE_TTL_MS ?? "600000", 10);

type WalletProofChallenge = {
  userId: string;
  expiresAt: number;
};

export type TonProofPayload = {
  timestamp: number;
  domain: {
    lengthBytes?: number;
    value: string;
  };
  signature: string;
  payload: string;
};

export type VerifyTonProofInput = {
  address: string;
  proof: TonProofPayload;
  walletStateInit: string;
  expectedPayload: string;
  expectedDomain: string;
  currentPublicKey?: Buffer;
};

const challenges = new Map<string, WalletProofChallenge>();

function cleanupExpiredChallenges(now = Date.now()) {
  for (const [payload, challenge] of challenges.entries()) {
    if (challenge.expiresAt <= now) challenges.delete(payload);
  }
}

export function createWalletProofChallenge(userId: string): { payload: string; expiresAt: Date } {
  cleanupExpiredChallenges();
  const payload = crypto.randomBytes(16).toString("hex");
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS);
  challenges.set(payload, { userId, expiresAt: expiresAt.getTime() });
  return { payload, expiresAt };
}

export function consumeWalletProofChallenge(userId: string, payload: string): boolean {
  cleanupExpiredChallenges();
  const challenge = challenges.get(payload);
  if (!challenge || challenge.userId !== userId || challenge.expiresAt <= Date.now()) return false;
  challenges.delete(payload);
  return true;
}

function uint32Le(value: number): Buffer {
  const buf = Buffer.alloc(4);
  buf.writeUInt32LE(value);
  return buf;
}

function uint64Le(value: number): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(value));
  return buf;
}

function toSignedInt32(workchain: number): number {
  return workchain === -1 ? 0xffffffff : workchain;
}

function parseStateInit(walletStateInit: string): StateInit {
  const cell = Cell.fromBase64(walletStateInit);
  return loadStateInit(cell.beginParse());
}

function walletCodeHash(contract: { init?: StateInit | null }): string | null {
  return contract.init?.code?.hash().toString("hex") ?? null;
}

function knownWalletCodeLoaders(): Array<{ hash: string; load: (slice: Slice) => Buffer }> {
  const zeroKey = Buffer.alloc(32);
  const contracts = [
    { contract: WalletContractV1R1.create({ workchain: 0, publicKey: zeroKey }), load: (s: Slice) => { s.loadUint(32); return s.loadBuffer(32); } },
    { contract: WalletContractV1R2.create({ workchain: 0, publicKey: zeroKey }), load: (s: Slice) => { s.loadUint(32); return s.loadBuffer(32); } },
    { contract: WalletContractV1R3.create({ workchain: 0, publicKey: zeroKey }), load: (s: Slice) => { s.loadUint(32); return s.loadBuffer(32); } },
    { contract: WalletContractV2R1.create({ workchain: 0, publicKey: zeroKey }), load: (s: Slice) => { s.loadUint(32); return s.loadBuffer(32); } },
    { contract: WalletContractV2R2.create({ workchain: 0, publicKey: zeroKey }), load: (s: Slice) => { s.loadUint(32); return s.loadBuffer(32); } },
    { contract: WalletContractV3R1.create({ workchain: 0, publicKey: zeroKey }), load: (s: Slice) => { s.loadUint(32); s.loadUint(32); return s.loadBuffer(32); } },
    { contract: WalletContractV3R2.create({ workchain: 0, publicKey: zeroKey }), load: (s: Slice) => { s.loadUint(32); s.loadUint(32); return s.loadBuffer(32); } },
    { contract: WalletContractV4.create({ workchain: 0, publicKey: zeroKey }), load: (s: Slice) => { s.loadUint(32); s.loadUint(32); return s.loadBuffer(32); } },
    {
      contract: WalletContractV5R1.create({
        publicKey: zeroKey,
        walletId: {
          networkGlobalId: -239,
          context: { workchain: 0, walletVersion: "v5r1", subwalletNumber: 0 },
        },
      }),
      load: (s: Slice) => { s.loadBoolean(); s.loadUint(32); s.loadUint(32); return s.loadBuffer(32); },
    },
  ];

  return contracts
    .map(({ contract, load }) => {
      const hash = walletCodeHash(contract);
      return hash ? { hash, load } : null;
    })
    .filter((item): item is { hash: string; load: (slice: Slice) => Buffer } => item !== null);
}

export const WALLET_TG_CODE_HASH = "9149ae51c1e4689710cebf7830297b16acfbadb363a920a537893e7ffeeca768";

export function isWalletTgStateInit(walletStateInit: string): boolean {
  try {
    return parseStateInit(walletStateInit).code?.hash().toString("hex") === WALLET_TG_CODE_HASH;
  } catch {
    return false;
  }
}

function tryExtractPublicKey(stateInit: StateInit): Buffer | null {
  if (!stateInit.code || !stateInit.data) return null;
  const codeHash = stateInit.code.hash().toString("hex");
  if (codeHash === WALLET_TG_CODE_HASH) {
    const s = stateInit.data.beginParse();
    s.loadUint(8);
    s.loadUint(32);
    s.loadUint(32);
    return s.loadBuffer(32);
  }
  const loader = knownWalletCodeLoaders().find((candidate) => candidate.hash === codeHash);
  if (!loader) return null;
  return loader.load(stateInit.data.beginParse());
}

function buildTonProofHash(address: Address, proof: TonProofPayload): Buffer {
  const domain = Buffer.from(proof.domain.value, "utf8");
  const addressHash = Buffer.from(address.hash);
  const message = Buffer.concat([
    Buffer.from(TON_PROOF_PREFIX),
    uint32Le(toSignedInt32(address.workChain)),
    addressHash,
    uint32Le(proof.domain.lengthBytes ?? domain.byteLength),
    domain,
    uint64Le(proof.timestamp),
    Buffer.from(proof.payload),
  ]);

  const messageHash = crypto.createHash("sha256").update(message).digest();
  return crypto
    .createHash("sha256")
    .update(Buffer.concat([Buffer.from([0xff, 0xff]), Buffer.from(TON_CONNECT_PREFIX), messageHash]))
    .digest();
}

export function verifyTonProof(input: VerifyTonProofInput): { ok: true } | { ok: false; error: string } {
  if (input.proof.payload !== input.expectedPayload) return { ok: false, error: "invalid_payload" };
  if (input.proof.domain.value !== input.expectedDomain) return { ok: false, error: "invalid_domain" };
  if (input.proof.domain.lengthBytes !== undefined && input.proof.domain.lengthBytes !== Buffer.byteLength(input.proof.domain.value)) {
    return { ok: false, error: "invalid_domain_length" };
  }

  const now = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(input.proof.timestamp) || Math.abs(now - input.proof.timestamp) > PROOF_MAX_AGE_SECONDS) {
    return { ok: false, error: "expired_proof" };
  }

  let address: Address;
  let stateInit: StateInit;
  try {
    address = Address.parse(input.address);
    stateInit = parseStateInit(input.walletStateInit);
  } catch {
    return { ok: false, error: "invalid_wallet_proof" };
  }

  const derivedAddress = contractAddress(address.workChain, stateInit);
  if (!derivedAddress.equals(address)) return { ok: false, error: "state_init_address_mismatch" };

  const publicKey = input.currentPublicKey ?? tryExtractPublicKey(stateInit);
  if (!publicKey) return { ok: false, error: "unsupported_wallet_state_init" };

  try {
    const signature = Buffer.from(input.proof.signature, "base64");
    const hash = buildTonProofHash(address, input.proof);
    return signVerify(hash, signature, publicKey) ? { ok: true } : { ok: false, error: "invalid_signature" };
  } catch {
    return { ok: false, error: "invalid_signature" };
  }
}

type GetMethodClient = {
  runGetMethod(address: string, method: string): Promise<{ exit_code: number; stack: unknown[] }>;
};

export async function readWalletTgPublicKey(client: GetMethodClient, address: string): Promise<Buffer | null> {
  const result = await client.runGetMethod(address, "get_public_key");
  if (result.exit_code !== 0) {
    return null;
  }
  const item = result.stack[0] as { type?: string; value?: string } | undefined;
  if (!item || item.type !== "num" || typeof item.value !== "string") {
    throw new Error("WalletTg get_public_key returned an unexpected stack");
  }
  const hex = BigInt(item.value).toString(16).padStart(64, "0");
  if (hex.length !== 64) throw new Error("WalletTg get_public_key is not 256 bits");
  return Buffer.from(hex, "hex");
}

