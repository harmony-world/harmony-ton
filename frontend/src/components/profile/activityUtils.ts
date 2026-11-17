import type { UserCampaign } from '../../api/users'

export type StatusTab = 'active' | 'completed'

function isCompletedStatus(status: UserCampaign['status']) {
  return status === 'completed' || status === 'refunded'
}

export function filterByStatusTab<T extends { status: UserCampaign['status'] }>(items: T[], tab: StatusTab) {
  return items.filter((item) => (tab === 'completed' ? isCompletedStatus(item.status) : !isCompletedStatus(item.status)))
}
