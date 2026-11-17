import crypto from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { Cell, beginCell, contractAddress, storeStateInit, type StateInit } from "@ton/core";
import { keyPairFromSeed, sign } from "@ton/crypto";
import {
  WALLET_TG_CODE_HASH,
  isWalletTgStateInit,
  readWalletTgPublicKey,
  verifyTonProof,
} from "../services/ton-proof.js";

const TRAMPOLINE = Cell.fromBoc(
  Buffer.from("b5ee9c7241010101001a000030ff00209821d7498308b9f240df8085f833d0ed1e20ed53d969427e39", "hex"),
)[0]!;
const DOMAIN = "app.harmonymarket.click";
const PAYLOAD = "0123456789abcdef0123456789abcdef";

function keyPair(seedByte: number) {
  return keyPairFromSeed(Buffer.alloc(32, seedByte));
}

function walletTg(anchorPublicKey: Buffer) {
  const init: StateInit = {
    code: TRAMPOLINE,
    data: beginCell().storeUint(0, 8).storeUint(0, 32).storeUint(0x7fff7f11, 32).storeBuffer(anchorPublicKey).endCell(),
  };
  const address = contractAddress(0, init);
  const stateInit = beginCell().store(storeStateInit(init)).endCell().toBoc().toString("base64");
  return { address, stateInit };
}

function signProof(address: ReturnType<typeof contractAddress>, secretKey: Buffer, timestamp: number) {
  const domain = Buffer.from(DOMAIN, "utf8");
  const wc = Buffer.alloc(4);
  wc.writeUInt32LE(0);
  const len = Buffer.alloc(4);
  len.writeUInt32LE(domain.byteLength);
  const ts = Buffer.alloc(8);
  ts.writeBigUInt64LE(BigInt(timestamp));
  const msg = Buffer.concat([Buffer.from("ton-proof-item-v2/"), wc, Buffer.from(address.hash), len, domain, ts, Buffer.from(PAYLOAD)]);
  const msgHash = crypto.createHash("sha256").update(msg).digest();
  const full = crypto
    .createHash("sha256")
    .update(Buffer.concat([Buffer.from([0xff, 0xff]), Buffer.from("ton-connect"), msgHash]))
    .digest();
  return {
    timestamp,
    domain: { lengthBytes: domain.byteLength, value: DOMAIN },
    signature: sign(full, secretKey).toString("base64"),
    payload: PAYLOAD,
  };
}

function verify(wallet: ReturnType<typeof walletTg>, secretKey: Buffer, currentPublicKey?: Buffer) {
  return verifyTonProof({
    address: wallet.address.toString(),
    proof: signProof(wallet.address, secretKey, Math.floor(Date.now() / 1000)),
    walletStateInit: wallet.stateInit,
    expectedPayload: PAYLOAD,
    expectedDomain: DOMAIN,
    currentPublicKey,
  });
}

describe("WalletTg ton_proof", () => {
  it("the trampoline from the docs has the documented code hash", () => {
    expect(TRAMPOLINE.hash().toString("hex")).toBe(WALLET_TG_CODE_HASH);
  });

  it("recognises a WalletTg StateInit and nothing else", () => {
    const anchor = keyPair(1);
    expect(isWalletTgStateInit(walletTg(anchor.publicKey).stateInit)).toBe(true);
    expect(isWalletTgStateInit("not-a-boc")).toBe(false);
  });

  it("accepts a not-yet-deployed wallet signed with its anchor key", () => {
    const anchor = keyPair(1);
    expect(verify(walletTg(anchor.publicKey), anchor.secretKey)).toEqual({ ok: true });
  });

  it("rejects a proof signed by a key that is not the wallet's", () => {
    const anchor = keyPair(1);
    const stranger = keyPair(2);
    expect(verify(walletTg(anchor.publicKey), stranger.secretKey)).toEqual({ ok: false, error: "invalid_signature" });
  });

  it("after rotation: the on-chain key signs, the old anchor key no longer does", () => {
    const anchor = keyPair(1);
    const rotated = keyPair(3);
    const wallet = walletTg(anchor.publicKey);
    expect(verify(wallet, rotated.secretKey, rotated.publicKey)).toEqual({ ok: true });
    expect(verify(wallet, anchor.secretKey, rotated.publicKey)).toEqual({ ok: false, error: "invalid_signature" });
  });

  it("rejects a StateInit that does not derive the claimed address", () => {
    const anchor = keyPair(1);
    const other = walletTg(keyPair(4).publicKey);
    const result = verifyTonProof({
      address: other.address.toString(),
      proof: signProof(other.address, anchor.secretKey, Math.floor(Date.now() / 1000)),
      walletStateInit: walletTg(anchor.publicKey).stateInit,
      expectedPayload: PAYLOAD,
      expectedDomain: DOMAIN,
    });
    expect(result).toEqual({ ok: false, error: "state_init_address_mismatch" });
  });
});

describe("readWalletTgPublicKey", () => {
  it("returns the getter key of a deployed wallet", async () => {
    const client = {
      runGetMethod: vi.fn().mockResolvedValue({
        exit_code: 0,
        stack: [{ type: "num", value: "0x4242424242424242424242424242424242424242424242424242424242424242" }],
      }),
    };
    const key = await readWalletTgPublicKey(client, "EQDHo6P-imEpPwW_QhEdWZBXgz634bAXaat4kkLuTW7EZncr");
    expect(key?.toString("hex")).toBe("4242424242424242424242424242424242424242424242424242424242424242");
    expect(client.runGetMethod).toHaveBeenCalledWith("EQDHo6P-imEpPwW_QhEdWZBXgz634bAXaat4kkLuTW7EZncr", "get_public_key");
  });

  it("keeps leading zero bytes of the key", async () => {
    const client = { runGetMethod: vi.fn().mockResolvedValue({ exit_code: 0, stack: [{ type: "num", value: "0x1" }] }) };
    const key = await readWalletTgPublicKey(client, "x");
    expect(key?.length).toBe(32);
    expect(key?.toString("hex")).toBe("0".repeat(63) + "1");
  });

  it("returns null for an account that is not deployed (exit code -13)", async () => {
    const client = { runGetMethod: vi.fn().mockResolvedValue({ exit_code: -13, stack: [{ type: "num", value: "0x1339c" }] }) };
    expect(await readWalletTgPublicKey(client, "x")).toBeNull();
  });

  it("throws when the chain cannot be read, so the caller does not fall back to a stale anchor key", async () => {
    const client = { runGetMethod: vi.fn().mockRejectedValue(new Error("TonCenter runGetMethod error 500")) };
    await expect(readWalletTgPublicKey(client, "x")).rejects.toThrow("500");
  });
});
