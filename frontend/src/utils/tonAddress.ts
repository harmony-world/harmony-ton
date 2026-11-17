import { Address } from '@ton/core'

export function tonAddressCandidates(address: string, testOnly = true): string[] {
  try {
    const parsed = Address.parse(address)
    const raw = parsed.toRawString()
    return [
      address,
      parsed.toString({ testOnly, bounceable: true }),
      parsed.toString({ testOnly, bounceable: false }),
      raw,
      raw.toUpperCase(),
    ].filter((value, index, arr) => arr.indexOf(value) === index)
  } catch {
    return address ? [address] : []
  }
}

export function tonAddressesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false
  const bCandidates = new Set(tonAddressCandidates(b))
  return tonAddressCandidates(a).some((candidate) => bCandidates.has(candidate))
}

export function shortTonAddress(address: string): string {
  return address.length > 14 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address
}
