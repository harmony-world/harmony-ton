export function formatDate(iso: string, locale = 'ru-RU'): string {
  return new Date(iso).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export function formatShortDate(iso: string, locale = 'ru-RU'): string {
  return new Date(iso).toLocaleDateString(locale, { day: 'numeric', month: 'short' })
}

export function formatProfileDate(iso: string, locale = 'ru-RU'): string {
  return new Date(iso).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })
}

export function formatDonationDateTime(iso: string, locale = 'ru-RU'): string {
  return new Date(iso).toLocaleString(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatUsd(amount: number): string {
  if (amount >= 1000) return `$${(amount / 1000).toFixed(1)}K`
  return `$${Math.round(amount)}`
}

export function formatDonationAmount(amount: number): string {
  return amount.toFixed(1)
}
