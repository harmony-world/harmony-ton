import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import crypto from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import {
  DOC_HASH_ALGO,
  docFingerprint,
  upgradeLegacyDocHash,
  migrateLegacyDocHashes,
  redactDiditPayload,
} from "../services/kyc-privacy.js";

const KEY = "test_doc_hash_key_0123456789abcdef0123456789";
const DOC = "4510123456";
const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

describe("document fingerprint", () => {
  beforeEach(() => {
    process.env.DOC_HASH_KEY = KEY;
  });
  afterEach(() => {
    delete process.env.DOC_HASH_KEY;
  });

  it("is stable for the same document, so duplicates are still found", () => {
    expect(docFingerprint(DOC)).toBe(docFingerprint(DOC));
    expect(docFingerprint(DOC)).not.toBe(docFingerprint("4510123457"));
  });

  it("is not the unkeyed sha256 an attacker can brute-force", () => {
    expect(docFingerprint(DOC)).not.toBe(sha256(DOC));
  });

  it("depends on the key", () => {
    const withKey = docFingerprint(DOC);
    process.env.DOC_HASH_KEY = "another_key_0123456789abcdef0123456789abcdef";
    expect(docFingerprint(DOC)).not.toBe(withKey);
  });

  it("refuses to compute without a key", () => {
    delete process.env.DOC_HASH_KEY;
    expect(() => docFingerprint(DOC)).toThrow(/DOC_HASH_KEY/);
  });

  it("refuses a key too short to be a secret", () => {
    process.env.DOC_HASH_KEY = "short";
    expect(() => docFingerprint(DOC)).toThrow(/DOC_HASH_KEY/);
  });

  it("upgrades a legacy sha256 to exactly what a fresh KYC would produce", () => {
    expect(upgradeLegacyDocHash(sha256(DOC))).toBe(docFingerprint(DOC));
  });
});

describe("legacy fingerprint migration", () => {
  beforeEach(() => {
    process.env.DOC_HASH_KEY = KEY;
  });
  afterEach(() => {
    delete process.env.DOC_HASH_KEY;
  });

  it("rewrites every legacy row and marks it with the new algorithm", async () => {
    const findMany = vi.fn().mockResolvedValue([{ id: "u1", docHash: sha256(DOC) }]);
    const update = vi.fn().mockResolvedValue({});
    const prisma = { user: { findMany, update } } as unknown as PrismaClient;

    const upgraded = await migrateLegacyDocHashes(prisma);

    expect(upgraded).toBe(1);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { docHashAlgo: "sha256", docHash: { not: null } } }),
    );
    expect(update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { docHash: docFingerprint(DOC), docHashAlgo: DOC_HASH_ALGO },
    });
  });

  it("does nothing when there is nothing legacy left", async () => {
    const update = vi.fn();
    const prisma = {
      user: { findMany: vi.fn().mockResolvedValue([]), update },
    } as unknown as PrismaClient;

    expect(await migrateLegacyDocHashes(prisma)).toBe(0);
    expect(update).not.toHaveBeenCalled();
  });
});

describe("Didit payload redaction", () => {
  const PII = {
    first_name: "Иван",
    last_name: "Петров",
    full_name: "Петров Иван Сергеевич",
    date_of_birth: "1990-01-02",
    place_of_birth: "г. Тверь",
    document_number: DOC,
    personal_number: "123-456-789 00",
    mrz: "P<RUSPETROV<<IVAN<<<<<<<<<<<<<<<<<<<<<<<<<<<",
    address: "ул. Ленина, 1",
    formatted_address: "ул. Ленина, 1, Тверь",
    front_image: "https://service-didit-verification-production.s3.amazonaws.com/front.jpg",
    portrait_image: "https://service-didit-verification-production.s3.amazonaws.com/face.jpg",
  };
  const decision = {
    session_id: "sess-1",
    session_number: 42,
    status: "Approved",
    workflow_id: "wf-1",
    vendor_data: "user-uuid",
    session_url: "https://verify.didit.me/session/sess-1",
    features: ["OCR", "LIVENESS"],
    id_verifications: [{ node_id: "node-id", status: "Approved", ...PII }],
    liveness_checks: [{ node_id: "node-live", status: "Approved", reference_image: PII.portrait_image }],
    ip_analyses: [{ node_id: "node-ip", status: "Approved", ip_address: "203.0.113.7" }],
    contact_details: { email: "ivan@example.com", phone: "+79990000000" },
    expected_details: { first_name: "Иван" },
    something_new_from_didit: { passport: DOC },
  };

  it("keeps nothing that describes the person", () => {
    const stored = JSON.stringify(redactDiditPayload(decision));
    for (const value of [...Object.values(PII), "203.0.113.7", "ivan@example.com", "+79990000000"]) {
      expect(stored).not.toContain(value);
    }
  });

  it("drops fields it does not know", () => {
    const stored = redactDiditPayload(decision);
    expect(stored).not.toHaveProperty("something_new_from_didit");
    expect(stored).not.toHaveProperty("contact_details");
    expect(stored).not.toHaveProperty("expected_details");
  });

  it("keeps which checks ran and how they ended", () => {
    expect(redactDiditPayload(decision)).toEqual({
      session_id: "sess-1",
      session_number: 42,
      status: "Approved",
      workflow_id: "wf-1",
      vendor_data: "user-uuid",
      session_url: "https://verify.didit.me/session/sess-1",
      features: ["OCR", "LIVENESS"],
      id_verifications: [{ node_id: "node-id", status: "Approved" }],
      liveness_checks: [{ node_id: "node-live", status: "Approved" }],
      ip_analyses: [{ node_id: "node-ip", status: "Approved" }],
    });
  });

  it("keeps what the resume link needs", () => {
    const stored = redactDiditPayload({ status: "Not Started", url: "https://verify.didit.me/s/1" });
    expect(stored).toEqual({ status: "Not Started", url: "https://verify.didit.me/s/1" });
  });

  it("redacts the decision nested inside a webhook", () => {
    const stored = redactDiditPayload({ event_id: "evt-1", status: "Approved", decision });
    expect(JSON.stringify(stored)).not.toContain(DOC);
    expect(stored.decision).toMatchObject({ id_verifications: [{ node_id: "node-id", status: "Approved" }] });
  });

  it("stores nothing for a payload that is not an object", () => {
    expect(redactDiditPayload(null)).toEqual({});
    expect(redactDiditPayload("raw")).toEqual({});
  });
});
