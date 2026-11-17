import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Address } from '@ton/core'
import { walletsApi } from '../../api/wallets'

export function PayoutWalletKindNote({ address }: { address: string }) {
  const { t } = useTranslation('create')
  const trimmed = address.trim()
  let valid = false
  try {
    Address.parse(trimmed)
    valid = true
  } catch {
    valid = false
  }
  const { data } = useQuery({
    queryKey: ['wallet-kind', trimmed],
    queryFn: () => walletsApi.kind(trimmed),
    enabled: valid,
    staleTime: 5 * 60_000,
    retry: false,
  })
  if (!valid || !data) return null
  if (data.kind === 'wallet_tg') {
    return <p className="text-xs leading-snug" style={{ color: '#D97706' }}>{t('goal.walletTgGramOnly')}</p>
  }
  if (data.kind === null) {
    return <p className="text-xs leading-snug text-[var(--tg-theme-hint-color,#8E8E93)]">{t('goal.walletKindUnknown')}</p>
  }
  return null
}
