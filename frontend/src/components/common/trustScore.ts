export type TrustScoreZone = 'red' | 'gray' | 'green'

export function getTrustScoreZone(score: number): TrustScoreZone {
  if (score >= 70) return 'green'
  if (score <= 30) return 'red'
  return 'gray'
}

export function getTrustScoreTone(score: number) {
  const zone = getTrustScoreZone(score)
  if (zone === 'green') {
    return {
      labelKey: 'trustScore.high',
      color: '#1F8A5B',
      bg: 'rgba(31,138,91,.12)',
      border: 'rgba(31,138,91,.22)',
    }
  }
  if (zone === 'red') {
    return {
      labelKey: 'trustScore.low',
      color: '#D93025',
      bg: 'rgba(217,48,37,.11)',
      border: 'rgba(217,48,37,.22)',
    }
  }
  return {
    labelKey: 'trustScore.normal',
    color: '#5F6368',
    bg: 'rgba(95,99,104,.12)',
    border: 'rgba(95,99,104,.24)',
  }
}
