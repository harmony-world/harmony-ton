import { api } from './client'

export interface LeaderEntry {
  rank: number
  userId: string
  firstName: string | null
  username: string | null
  photoUrl: string | null
  totalDonatedUsd: number
  donationCount: number
  donorStatus: string | null
}

export interface LeaderboardResponse {
  leaders: LeaderEntry[]
  myEntry: LeaderEntry | null
}

export const leaderboardApi = {
  get: () => api.get<LeaderboardResponse>('/leaderboard'),
}
