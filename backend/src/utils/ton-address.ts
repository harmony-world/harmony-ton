import { Address } from "@ton/core";

export function isTestnet(): boolean {
  return process.env.TON_NETWORK !== "mainnet";
}

export type PayoutAddressRejection = "payout_address_invalid" | "payout_address_wrong_network";

export function checkPayoutAddress(
  value: string,
  testOnly = isTestnet(),
): PayoutAddressRejection | null {
  if (Address.isFriendly(value)) {
    try {
      return Address.parseFriendly(value).isTestOnly === testOnly
        ? null
        : "payout_address_wrong_network";
    } catch {
      return "payout_address_invalid";
    }
  }
  try {
    Address.parse(value);
    return null;
  } catch {
    return "payout_address_invalid";
  }
}

export function normalizeTonAddress(addr: string, testOnly = isTestnet()): string {
  try {
    return Address.parse(addr).toString({ testOnly, bounceable: true });
  } catch {
    return addr;
  }
}

export function tonAddressCandidates(addr: string, testOnly = isTestnet()): string[] {
  try {
    const parsed = Address.parse(addr);
    const raw = parsed.toRawString();
    return [
      addr,
      parsed.toString({ testOnly, bounceable: true }),
      parsed.toString({ testOnly, bounceable: false }),
      raw,
      raw.toUpperCase(),
    ].filter((value, index, arr) => arr.indexOf(value) === index);
  } catch {
    return [addr];
  }
}
