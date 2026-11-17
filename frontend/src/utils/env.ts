export function requireProductionEnv(name: string, value: string | undefined, isProd = import.meta.env.PROD): string {
  if (value) return value
  if (isProd) {
    throw new Error(`${name} is required for production builds`)
  }
  return 'http://localhost:3000'
}

function parseTonNetwork(raw: string | undefined): 'testnet' | 'mainnet' {
  const value = raw ?? 'testnet'
  if (value === 'testnet' || value === 'mainnet') return value
  throw new Error(`Unsupported VITE_TON_NETWORK: ${value}`)
}

export const API_URL = requireProductionEnv('VITE_API_URL', import.meta.env.VITE_API_URL as string | undefined)
export const TON_MANIFEST_URL = import.meta.env.VITE_TON_MANIFEST_URL as string | undefined ?? ''
export const TWA_RETURN_URL = (
  import.meta.env.VITE_TWA_RETURN_URL as `${string}://${string}` | undefined
) ?? `https://t.me/${(import.meta.env.VITE_BOT_USERNAME as string | undefined) ?? 'Gram_Harmony_Bot'}/app`
export const TON_NETWORK = parseTonNetwork(import.meta.env.VITE_TON_NETWORK as string | undefined)
export const TON_CONNECT_NETWORK = TON_NETWORK === 'mainnet' ? '-239' : '-3'
export const IS_TESTNET = TON_NETWORK !== 'mainnet'
export const IS_DEV = import.meta.env.DEV
export const USE_MOCKS = (import.meta.env.VITE_USE_MOCKS as string | undefined) === 'true'
export const BOT_USERNAME = (import.meta.env.VITE_BOT_USERNAME as string | undefined) ?? 'Gram_Harmony_Bot'
