export const POST_DONATION_POLL_TIMEOUT_MS = 5 * 60_000

export interface PostDonationWatch {
  until: number
  raisedAmountUsd: number
  donorCount: number
  donationCount: number
}

function isPostDonationWatchActive(watch: PostDonationWatch) {
  return Date.now() < watch.until
}

export function shouldPollPostDonationCampaign(
  watch: PostDonationWatch | null,
  campaign: { raisedAmountUsd: number; donorCount: number } | undefined,
) {
  if (!watch || !isPostDonationWatchActive(watch)) return false
  if (!campaign) return true
  return campaign.raisedAmountUsd <= watch.raisedAmountUsd && campaign.donorCount <= watch.donorCount
}

export function shouldPollPostDonationDonations(
  watch: PostDonationWatch | null,
  donations: { id: string }[] | undefined,
) {
  if (!watch || !isPostDonationWatchActive(watch)) return false
  return (donations?.length ?? 0) <= watch.donationCount
}

export function hasPostDonationWatchConfirmed(
  watch: PostDonationWatch | null,
  campaign: { raisedAmountUsd: number; donorCount: number } | undefined,
  donations: { id: string }[],
) {
  if (!watch || !campaign) return false
  return (
    campaign.raisedAmountUsd > watch.raisedAmountUsd ||
    campaign.donorCount > watch.donorCount ||
    donations.length > watch.donationCount
  )
}
