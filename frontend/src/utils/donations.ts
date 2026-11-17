import type { DonationItem } from '../api/donations'

export function donationDonorLabel(donation: DonationItem, anonymousLabel = 'Anonymous'): string {
  if (donation.isAnonymous) return anonymousLabel
  return donation.donorName ?? anonymousLabel
}

export function donationTelegramLink(donation: DonationItem): string | null {
  if (donation.isAnonymous) return null
  if (donation.donorTelegramUsername) return `https://t.me/${donation.donorTelegramUsername}`
  if (donation.donorTelegramUserId) return `tg://user?id=${donation.donorTelegramUserId}`
  return null
}
