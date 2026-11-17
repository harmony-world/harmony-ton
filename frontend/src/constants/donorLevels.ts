import type { DonorLevel } from '../types'

export interface DonorLevelConfig {
  level: DonorLevel
  emoji: string
  icon: string
  name: string
  color: string
  bg: string
  threshold: number
  description: string
}

export const DONOR_LEVELS: DonorLevelConfig[] = [
  { level: 1, emoji: '🌱', icon: '/emoji/level_1.webp', name: 'Sprout',   color: '#1F8A5B', bg: 'rgba(31,138,91,.12)',   threshold: 0,    description: 'Your first step towards good' },
  { level: 2, emoji: '💡', icon: '/emoji/level_2.webp', name: 'Helper',   color: 'var(--tg-brand-color)', bg: 'rgba(var(--tg-brand-color-rgb),.12)',  threshold: 50,   description: 'You help those in need' },
  { level: 3, emoji: '🌳', icon: '/emoji/level_3.webp', name: 'Patron',   color: '#F59E0B', bg: 'rgba(245,158,11,.12)',  threshold: 200,  description: 'Your support makes a difference' },
  { level: 4, emoji: '🦅', icon: '/emoji/level_4.webp', name: 'Guardian', color: '#F97316', bg: 'rgba(249,115,22,.12)',  threshold: 500,  description: 'You inspire others to do good' },
  { level: 5, emoji: '🔥', icon: '/emoji/level_5.webp', name: 'Keeper',   color: '#7C3AED', bg: 'rgba(124,58,237,.12)', threshold: 1000, description: 'The highest donor level' },
]

export function getDonorLevel(totalUsd: number): DonorLevelConfig {
  let result = DONOR_LEVELS[0]!
  for (const lvl of DONOR_LEVELS) {
    if (totalUsd >= lvl.threshold) result = lvl
  }
  return result
}
