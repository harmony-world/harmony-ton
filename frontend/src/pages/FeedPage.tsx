import { useState, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { CampaignCategory } from '../types'
import { useCampaigns } from '../hooks/useApi'
import { CampaignCardSkeleton } from '../components/CampaignCardSkeleton'
import { ErrorState } from '../components/ErrorState'
import type { CampaignListItem } from '../api/campaigns'
import { CAMPAIGN_CATEGORY_OPTIONS } from '../constants/campaignCategories'
import { CampaignCard } from '../components/feed/CampaignCard'
import { LanguageSwitcher } from '../components/LanguageSwitcher'
import { HarmonyBadge } from '../components/common/HarmonyBadge'

const CATEGORY_VALUES: (CampaignCategory | 'all')[] = [
  'all',
  ...CAMPAIGN_CATEGORY_OPTIONS.map((c) => c.value),
]

type StatusTab = 'active' | 'completed'

type FeedSort = 'trustScore' | 'createdAt'
const FEED_SORT_KEY = 'harmony.feedSort'
function readFeedSort(): FeedSort {
  try {
    return localStorage.getItem(FEED_SORT_KEY) === 'createdAt' ? 'createdAt' : 'trustScore'
  } catch {
    return 'trustScore'
  }
}
const STATUS_TAB_VALUES: StatusTab[] = ['active', 'completed']

function isCompletedStatus(status: CampaignListItem['status']) {
  return status === 'completed' || status === 'refunded'
}

export function FeedPage() {
  const { t } = useTranslation('feed')
  const [activeCategory, setActiveCategory] = useState<CampaignCategory | 'all'>('all')
  const [activeStatusTab, setActiveStatusTab] = useState<StatusTab>('active')
  const [sort, setSort] = useState<FeedSort>(() => readFeedSort())
  const [sortMenuOpen, setSortMenuOpen] = useState(false)
  const chooseSort = useCallback((next: FeedSort) => {
    setSort(next)
    setSortMenuOpen(false)
    try { localStorage.setItem(FEED_SORT_KEY, next) } catch {  }
  }, [])
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)
  const btnRefs = useRef<Map<string, HTMLButtonElement>>(new Map())

  const handleCategoryChange = useCallback((value: CampaignCategory | 'all') => {
    setActiveCategory(value)
    const btn = btnRefs.current.get(value)
    btn?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
  }, [])

  const filters = { sort, ...(activeCategory !== 'all' ? { category: activeCategory } : {}) }
  const { data, isLoading, isError, refetch } = useCampaigns(filters)

  const allCampaigns = data?.data ?? []
  const q = searchQuery.trim().toLowerCase()
  const campaigns = allCampaigns.filter((campaign) => {
    const ds = campaign.displayStatus
    const isTerminal = isCompletedStatus(campaign.status) || ds === 'expired_partial' || ds === 'expired_no_donations'
    const statusMatch = activeStatusTab === 'completed' ? isTerminal : !isTerminal
    if (!statusMatch) return false
    if (q) return campaign.title.toLowerCase().includes(q)
    return true
  })

  return (
    <div className="flex flex-col">
      <div className="sticky top-0 z-10 bg-[var(--tg-theme-bg-color,#fff)]">
        <div className="flex items-center justify-between px-4 pt-3 pb-2.5">
          <HarmonyBadge />
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <button
              type="button"
              aria-label={searchOpen ? t('closeSearch') : t('openSearch')}
              onClick={() => {
                setSearchOpen((v) => {
                  if (!v) setTimeout(() => searchInputRef.current?.focus(), 50)
                  else setSearchQuery('')
                  return !v
                })
              }}
              className="w-[38px] h-[38px] rounded-full bg-[var(--tg-theme-secondary-bg-color,#F2F2F7)] flex items-center justify-center active:opacity-70 transition-opacity focus:outline-none focus:ring-2 focus:ring-[var(--tg-theme-link-color,#007AFF)] focus:ring-offset-2"
            >
              {searchOpen ? (
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--tg-theme-text-color,#1C1C1E)" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              ) : (
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="var(--tg-theme-text-color,#1C1C1E)" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {searchOpen && (
          <div className="px-4 pb-2.5">
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('searchPlaceholder')}
              className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none"
              style={{
                background: 'var(--tg-theme-secondary-bg-color, #F2F2F7)',
                color: 'var(--tg-theme-text-color, #1C1C1E)',
              }}
            />
          </div>
        )}

        <div
          className="pb-3.5 px-4 scrollbar-none"
          style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', whiteSpace: 'nowrap' }}
        >
          <div style={{ display: 'inline-flex', gap: 8 }}>
            {CATEGORY_VALUES.map((value) => (
              <button
                key={value}
                ref={(el) => { if (el) btnRefs.current.set(value, el); else btnRefs.current.delete(value) }}
                onClick={() => handleCategoryChange(value)}
                className="transition-colors"
                style={{
                  padding: '8px 16px',
                  borderRadius: 99,
                  fontSize: 13.5,
                  fontWeight: activeCategory === value ? 600 : 500,
                  background: activeCategory === value ? 'var(--tg-brand-color)' : 'var(--tg-theme-secondary-bg-color, #F2F2F7)',
                  color: activeCategory === value ? '#fff' : 'var(--tg-theme-text-color, #1C1C1E)',
                  border: 'none',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
              >
                {value === 'all' ? t('all') : t(`categories.${value}`, { ns: 'common' })}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="px-4 py-2 flex flex-col gap-3.5">
        {!isLoading && !isError && allCampaigns.length > 0 && (
          <div className="flex items-center gap-1 pb-1 pt-0.5">
            <div className="w-9 shrink" aria-hidden="true" />
            <div className="flex-1 flex justify-center">
            <div
              className="inline-flex rounded-full p-1"
              style={{
                background: 'var(--tg-theme-secondary-bg-color, #F2F2F7)',
                border:
                  '1px solid color-mix(in srgb, var(--tg-theme-hint-color, #8E8E93) 12%, transparent)',
              }}
              role="tablist"
              aria-label={t('campaignStatusAria')}
            >
              {STATUS_TAB_VALUES.map((value) => {
                const selected = activeStatusTab === value
                return (
                  <button
                    key={value}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => setActiveStatusTab(value)}
                    className="min-h-9 rounded-full px-4 text-[13.5px] font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--tg-theme-link-color,#007AFF)] focus:ring-offset-2"
                    style={{
                      background: selected ? 'var(--tg-theme-bg-color, #fff)' : 'transparent',
                      color: selected
                        ? 'var(--tg-theme-text-color, #1C1C1E)'
                        : 'var(--tg-theme-hint-color, #8E8E93)',
                      boxShadow: selected ? '0 1px 7px rgba(20,20,30,.08)' : 'none',
                    }}
                  >
                    {t(value)}
                  </button>
                )
              })}
            </div>
            </div>
            <div className="relative w-9 shrink-0">
              <button
                type="button"
                onClick={() => setSortMenuOpen((v) => !v)}
                aria-label={t('sortAria')}
                aria-haspopup="menu"
                aria-expanded={sortMenuOpen}
                className="w-9 h-9 rounded-full flex items-center justify-center active:opacity-70 transition-opacity focus:outline-none focus:ring-2 focus:ring-[var(--tg-theme-link-color,#007AFF)] focus:ring-offset-2"
                style={{
                  background: 'var(--tg-theme-secondary-bg-color, #F2F2F7)',
                  color: 'var(--tg-theme-text-color, #1C1C1E)',
                  border: '1px solid color-mix(in srgb, var(--tg-theme-hint-color, #8E8E93) 12%, transparent)',
                }}
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M7 4v16M3.5 16.5L7 20l3.5-3.5" /><path d="M17 20V4M13.5 7.5L17 4l3.5 3.5" />
                </svg>
              </button>
              {sortMenuOpen && (
                <>
                  <div className="fixed inset-0 z-20" onClick={() => setSortMenuOpen(false)} aria-hidden="true" />
                  <div
                    role="menu"
                    className="absolute right-0 top-full mt-2 z-30 rounded-2xl py-1.5 min-w-[200px]"
                    style={{
                      background: 'var(--tg-theme-bg-color, #fff)',
                      border: '1px solid color-mix(in srgb, var(--tg-theme-hint-color, #8E8E93) 18%, transparent)',
                      boxShadow: '0 8px 28px rgba(0,0,0,.18)',
                    }}
                  >
                    {(['trustScore', 'createdAt'] as FeedSort[]).map((value) => (
                      <button
                        key={value}
                        type="button"
                        role="menuitemradio"
                        aria-checked={sort === value}
                        onClick={() => chooseSort(value)}
                        className="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-[14.5px] text-left active:opacity-70"
                        style={{ color: 'var(--tg-theme-text-color, #1C1C1E)', fontWeight: sort === value ? 600 : 400 }}
                      >
                        {t(value === 'trustScore' ? 'sortTrust' : 'sortNew')}
                        {sort === value && (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--tg-brand-color)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M20 6L9 17l-5-5" />
                          </svg>
                        )}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
        {isLoading && (
          <>
            <CampaignCardSkeleton />
            <CampaignCardSkeleton />
            <CampaignCardSkeleton />
          </>
        )}
        {isError && (
          <ErrorState message={t('loadError')} onRetry={() => void refetch()} />
        )}
        {!isLoading && !isError && campaigns.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center px-10">
            <div
              className="flex items-center justify-center mb-5"
              style={{ width: 84, height: 84, borderRadius: '50%', background: 'var(--tg-theme-secondary-bg-color, #EEF1F6)' }}
            >
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--tg-theme-hint-color, #B6BCC6)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 13l3-8h12l3 8" /><path d="M3 13v5a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5" /><path d="M3 13h5l1.5 2.5h5L16 13h5" />
              </svg>
            </div>
            <p className="font-bold text-[19px] text-[var(--tg-theme-text-color,#1C1C1E)] mb-2.5">{t('emptyTitle')}</p>
            <p className="text-[15px] leading-relaxed" style={{ color: 'var(--tg-theme-hint-color, #8E8E93)' }}>
              {activeStatusTab === 'completed' ? t('emptyCompleted') : t('emptyActive')}
            </p>
            <Link
              to="/create"
              className="mt-5 font-semibold text-white active:opacity-80 transition-opacity"
              style={{ height: 46, padding: '0 22px', borderRadius: 13, background: 'var(--tg-brand-color)', display: 'inline-flex', alignItems: 'center', fontSize: 15 }}
            >
              {t('createCampaign')}
            </Link>
          </div>
        )}
        {!isLoading &&
          !isError &&
          campaigns.map((campaign) => <CampaignCard key={campaign.id} campaign={campaign} />)}
      </div>
    </div>
  )
}
