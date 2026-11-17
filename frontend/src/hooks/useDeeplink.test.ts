import { describe, expect, it } from 'vitest'
import { routeFromStartParam } from './useDeeplink'

const campaignId = '123e4567-e89b-42d3-a456-426614174000'
const userId = '123e4567-e89b-42d3-a456-426614174001'

describe('routeFromStartParam', () => {
  it('allows only expected campaign and profile UUID deep links', () => {
    expect(routeFromStartParam(`c_${campaignId}`)).toBe(`/campaign/${campaignId}`)
    expect(routeFromStartParam(`profile_${userId}`)).toBe(`/profile/${userId}`)
  })

  it('rejects malformed, encoded, and overly broad payloads', () => {
    expect(routeFromStartParam('c_../../wallet')).toBeNull()
    expect(routeFromStartParam(`c_${campaignId}%2Fwallet`)).toBeNull()
    expect(routeFromStartParam('profile_123')).toBeNull()
    expect(routeFromStartParam(`campaign_${campaignId}`)).toBeNull()
  })
})
