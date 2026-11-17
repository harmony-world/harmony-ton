import { useState, useCallback, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams, useNavigate } from 'react-router-dom'
import { ApiError } from '../api/client'
import { useCampaign, useDonations, useRetryCampaignDeploy } from '../hooks/useApi'
import { useBackButton } from '../hooks/useBackButton'
import { useTelegramApp } from '../hooks/useTelegramApp'
import { PageSkeleton } from '../components/PageSkeleton'
import { ErrorState } from '../components/ErrorState'
import { DonateModal } from '../components/DonateModal'
import { getCampaignDisplayState, isCampaignFundraising } from './campaignDisplayState'
import { formatShortDate } from '../utils/format'
import { BOT_USERNAME } from '../utils/env'
import { shareText as shareTextUtil, shareViaPreparedMessage } from '../utils/telegram'
import { prepareShare } from '../api/share'
import { PhotoViewer } from '../components/campaign/PhotoViewer'
import { isDesktopPhotoViewerPlatform } from '../components/campaign/photoViewerPlatform'
import { CreatorRow } from '../components/campaign/CreatorRow'
import { CampaignHero } from '../components/campaign/CampaignHero'
import { CampaignDonations } from '../components/campaign/CampaignDonations'
import { CampaignBottomBar } from '../components/campaign/CampaignBottomBar'
import { ExpenseReportSection } from '../components/campaign/ExpenseReportSection'
import {
  POST_DONATION_POLL_TIMEOUT_MS,
  hasPostDonationWatchConfirmed,
  shouldPollPostDonationCampaign,
  shouldPollPostDonationDonations,
  type PostDonationWatch,
} from '../utils/postDonationWatch'

function daysLeft(deadline: string | null) {
  if (!deadline) return null
  const diff = Math.ceil((new Date(deadline).getTime() - Date.now()) / 86400000)
  return diff > 0 ? diff : 0
}

export function CampaignPage() {
  const { t, i18n } = useTranslation(['campaign', 'common'])
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const goBack = useCallback(
    () => navigate('/', { replace: true }),
    [navigate],
  )
  const { userId: tgUserId } = useTelegramApp()
  const [donateOpen, setDonateOpen] = useState(false)
  const [retryError, setRetryError] = useState<string | null>(null)
  const [photoState, setPhotoState] = useState({ campaignId: '', index: 0 })
  const [touchStartX, setTouchStartX] = useState<number | null>(null)
  const [showDesktopPhotoControls, setShowDesktopPhotoControls] = useState(() => isDesktopPhotoViewerPlatform())
  const [isPhotoViewerOpen, setIsPhotoViewerOpen] = useState(false)
  const [postDonationWatch, setPostDonationWatch] = useState<PostDonationWatch | null>(null)
  const lastPhotoTapRef = useRef<{ time: number; x: number; y: number } | null>(null)
  const handleBack = useCallback(() => {
    if (isPhotoViewerOpen) {
      setIsPhotoViewerOpen(false)
      return
    }
    goBack()
  }, [goBack, isPhotoViewerOpen])
  useBackButton(handleBack)
  useEffect(() => {
    const pointerQuery = window.matchMedia?.('(hover: hover) and (pointer: fine)')
    if (!pointerQuery) return

    const handlePointerChange = () => setShowDesktopPhotoControls(isDesktopPhotoViewerPlatform())
    pointerQuery.addEventListener?.('change', handlePointerChange)
    return () => pointerQuery.removeEventListener?.('change', handlePointerChange)
  }, [])
  const { data: campaign, isLoading, isError, refetch } = useCampaign(id ?? '', {
    pollForDonation: (currentCampaign) => shouldPollPostDonationCampaign(postDonationWatch, currentCampaign),
  })
  const campaignIsLive = campaign ? isCampaignFundraising(campaign) : false
  const { data: donations = [], refetch: refetchDonations } = useDonations(id ?? '', {
    pollForDonation: (currentDonations) => shouldPollPostDonationDonations(postDonationWatch, currentDonations),
    backgroundPoll: campaignIsLive,
  })
  const retryDeploy = useRetryCampaignDeploy(id ?? '')

  if (isLoading) return <PageSkeleton />
  if (isError || !campaign)
    return <ErrorState message={t('loadError')} onRetry={() => void refetch()} />

  const pctRaw =
    campaign.goalAmountUsd > 0
      ? Math.min(100, (campaign.raisedAmountUsd / campaign.goalAmountUsd) * 100)
      : 0
  const pctLabel = pctRaw < 1 && pctRaw > 0 ? pctRaw.toFixed(2) : Math.round(pctRaw).toString()
  const days = daysLeft(campaign.deadline ?? null)
  const creatorName = campaign.creator.tgFirstName ?? campaign.creator.tgUsername ?? t('anonymous')
  const initials = creatorName[0]?.toUpperCase() ?? '?'
  const campaignId = campaign.id
  const hasPhoto = campaign.photos.length > 0
  const hasMultiplePhotos = campaign.photos.length > 1
  const photoCount = campaign.photos.length
  const activePhotoIndex =
    photoState.campaignId === campaignId && photoCount > 0
      ? Math.min(photoState.index, photoCount - 1)
      : 0
  const activePhoto = hasPhoto ? campaign.photos[activePhotoIndex] : null
  const creatorTgUserId = campaign.creator.tgUserId
  const isCreator = !!(tgUserId && creatorTgUserId && String(tgUserId) === String(creatorTgUserId))
  const {
    isCompleted,
    isFrozen,
    isFundraising,
    canClaim,
    completionBadgeLabelKey,
    statsStatusLabelKey,
    bottomCompletedLabelKey,
    bottomCompletedColor,
  } = getCampaignDisplayState({ campaign, isCreator })
  const completionBadgeLabel = t(`common:${completionBadgeLabelKey}`)
  const statsStatusLabel = t(`common:${statsStatusLabelKey}`)
  const bottomCompletedLabel = t(`common:${bottomCompletedLabelKey}`)
  const isExpired = campaign.displayStatus === 'expired_partial' || campaign.displayStatus === 'expired_no_donations'
  const isSuspended = campaign.status === 'suspended'
  const canDonate = !isCompleted && !isFrozen && !isSuspended && !isExpired && !!campaign.onchainAddress
  const donationConfirmed = hasPostDonationWatchConfirmed(postDonationWatch, campaign, donations)
  const isDeployPending =
    !campaign.onchainAddress &&
    !isCompleted &&
    !isFrozen &&
    campaign.status !== 'rejected' &&
    campaign.status !== 'pending_moderation' &&
    campaign.deployStatus !== 'failed'
  const isDeployFailed = !campaign.onchainAddress && campaign.deployStatus === 'failed'
  const blockedDonationLabel = isDeployFailed
    ? isCreator
      ? t('blocked.deployFailed')
      : t('blocked.openingSoon')
    : campaign.status === 'pending_moderation'
      ? t('blocked.moderation')
    : isSuspended
      ? t('blocked.suspended')
    : isDeployPending
      ? t('blocked.deploying')
      : t('blocked.suspended')

  const handleRetryDeploy = () => {
    setRetryError(null)
    retryDeploy.mutate(undefined, {
      onSuccess: () => {
        void refetch()
      },
      onError: (error) => {
        setRetryError(error instanceof ApiError ? error.message : t('retryDeployError'))
      },
    })
  }

  const handleDonationSubmitted = () => {
    setPostDonationWatch({
      until: Date.now() + POST_DONATION_POLL_TIMEOUT_MS,
      raisedAmountUsd: campaign.raisedAmountUsd,
      donorCount: campaign.donorCount,
      donationCount: donations.length,
    })

    void Promise.all([refetch(), refetchDonations()])
  }

  function showPreviousPhoto() {
    if (!hasMultiplePhotos) return
    setPhotoState((current) => {
      const currentIndex = current.campaignId === campaignId ? current.index : activePhotoIndex
      return {
        campaignId,
        index: currentIndex === 0 ? photoCount - 1 : currentIndex - 1,
      }
    })
  }

  function showNextPhoto() {
    if (!hasMultiplePhotos) return
    setPhotoState((current) => {
      const currentIndex = current.campaignId === campaignId ? current.index : activePhotoIndex
      return {
        campaignId,
        index: (currentIndex + 1) % photoCount,
      }
    })
  }

  function handlePhotoTap(clientX: number, clientY: number) {
    if (!hasPhoto) return
    const now = Date.now()
    const previousTap = lastPhotoTapRef.current
    lastPhotoTapRef.current = { time: now, x: clientX, y: clientY }

    if (
      previousTap &&
      now - previousTap.time < 320 &&
      Math.abs(previousTap.x - clientX) < 32 &&
      Math.abs(previousTap.y - clientY) < 32
    ) {
      setIsPhotoViewerOpen(true)
      lastPhotoTapRef.current = null
    }
  }

  function handlePhotoSwipe(delta: number) {
    if (!hasMultiplePhotos || Math.abs(delta) <= 40) return
    if (delta > 0) showNextPhoto()
    else showPreviousPhoto()
  }

  const handleShare = async () => {
    try {
      const { msgId } = await prepareShare('campaign', campaign.id)
      const result = await shareViaPreparedMessage(msgId)
      if (result !== 'unsupported') return
    } catch {  }

    const deepLink = `https://t.me/${BOT_USERNAME}?start=c_${campaign.id}`
    const isChannel = campaign.organizerType === 'telegram_channel'
    const text = isChannel
      ? t('share.channelText', { channel: campaign.channelUsername ?? '', title: campaign.title, goal: campaign.goalAmountUsd, link: deepLink })
      : t('share.personalText', { title: campaign.title, goal: campaign.goalAmountUsd, link: deepLink })
    void shareTextUtil(text)
  }

  return (
    <div className="tg-app-viewport flex flex-col text-[var(--tg-theme-text-color,#1C1C1E)]">
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>

      <CampaignHero
        campaign={campaign}
        hasPhoto={hasPhoto}
        hasMultiplePhotos={hasMultiplePhotos}
        photoCount={photoCount}
        activePhotoIndex={activePhotoIndex}
        touchStartX={touchStartX}
        setTouchStartX={setTouchStartX}
        handlePhotoSwipe={handlePhotoSwipe}
        handlePhotoTap={handlePhotoTap}
        showDesktopPhotoControls={showDesktopPhotoControls}
        showPreviousPhoto={showPreviousPhoto}
        showNextPhoto={showNextPhoto}
        isCompleted={isCompleted}
        isFrozen={isFrozen}
        isExpired={isExpired}
        isFundraising={isFundraising}
        completionBadgeLabel={completionBadgeLabel}
      />

      <div className="px-4 pt-4 flex flex-col gap-5 pb-6">
        {campaign.organizerType === 'telegram_channel' && campaign.channelUsername ? (
          <div className="flex items-center gap-3 p-3 rounded-[14px]" style={{ background: 'var(--tg-theme-secondary-bg-color, #F7F7FA)' }}>
            <div className="w-10 h-10 rounded-full bg-[var(--tg-brand-color)]/10 flex items-center justify-center shrink-0">
              <span className="text-lg">📢</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate" style={{ color: 'var(--tg-theme-text-color, #1C1C1E)' }}>
                {campaign.channelUsername}
              </p>
              <p className="text-xs" style={{ color: 'var(--tg-theme-hint-color, #8E8E93)' }}>
                {t('fromChannel')}
              </p>
            </div>
            {campaign.channelUsername && (
              <a
                href={`https://t.me/${campaign.channelUsername.replace('@', '')}`}
                className="text-xs font-medium px-3 py-1.5 rounded-full"
                style={{ background: 'var(--tg-brand-color)', color: '#fff' }}
                onClick={(e) => e.stopPropagation()}
              >
                {t('open')}
              </a>
            )}
          </div>
        ) : (
          <CreatorRow
            userId={campaign.creator.id}
            name={creatorName}
            initials={initials}
            photoUrl={campaign.creator.tgPhotoUrl}
            username={campaign.creator.tgUsername}
            trustScore={campaign.trustScore}
            createdAt={campaign.createdAt}
          />
        )}

        <div className="rounded-[16px] p-4" style={{ background: 'var(--tg-theme-secondary-bg-color, #F7F7FA)' }}>
          <div className="flex items-baseline gap-1.5 mb-3">
            <span className="font-bold" style={{ fontSize: 26, letterSpacing: '-0.5px', color: 'var(--tg-theme-text-color, #1C1C1E)' }}>
              ${campaign.raisedAmountUsd}
            </span>
            <span className="font-medium text-[15px]" style={{ color: 'var(--tg-theme-hint-color, #8E8E93)' }}>
              {t('of')} ${campaign.goalAmountUsd}
            </span>
          </div>
          <div className="w-full rounded-full overflow-hidden mb-3" style={{ height: 9, background: 'var(--tg-theme-bg-color, #EBEBEF)' }}>
            <div className="h-full rounded-full" style={{ width: `${pctRaw}%`, background: '#1F8A5B' }} />
          </div>
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <span className="font-bold text-[15px]" style={{ color: 'var(--tg-theme-text-color, #1C1C1E)' }}>{pctLabel}%</span>
              <span className="text-[11.5px]" style={{ color: 'var(--tg-theme-hint-color, #8E8E93)' }}>{t('raised')}</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="font-bold text-[15px]" style={{ color: 'var(--tg-theme-text-color, #1C1C1E)' }}>{campaign.donorCount}</span>
              <span className="text-[11.5px]" style={{ color: 'var(--tg-theme-hint-color, #8E8E93)' }}>{t('donors')}</span>
            </div>
            <div className="flex flex-col items-end">
              {isCompleted ? (
                <>
                  <span className="font-bold text-[15px]" style={{ color: '#1F8A5B' }}>✓</span>
                  <span className="text-[11.5px]" style={{ color: '#1F8A5B' }}>{statsStatusLabel}</span>
                </>
              ) : days !== null ? (
                <>
                  <span className="font-bold text-[15px]" style={{ color: 'var(--tg-theme-text-color, #1C1C1E)' }}>{days} {t('daysShort')}</span>
                  <span className="text-[11.5px]" style={{ color: 'var(--tg-theme-hint-color, #8E8E93)' }}>{t('daysLeft')}</span>
                </>
              ) : campaign.deadline ? (
                <>
                  <span className="font-bold text-[15px]" style={{ color: 'var(--tg-theme-text-color, #1C1C1E)' }}>{formatShortDate(campaign.deadline, i18n.language)}</span>
                  <span className="text-[11.5px]" style={{ color: 'var(--tg-theme-hint-color, #8E8E93)' }}>{t('deadline')}</span>
                </>
              ) : null}
            </div>
          </div>
        </div>

        {campaign.claimStatus === 'claimed' && (
          <ExpenseReportSection
            campaignId={campaign.id}
            isCreator={isCreator}
            isPublic={campaign.isPublic}
            channelId={campaign.channelId}
            raisedAmountUsd={campaign.raisedAmountUsd}
          />
        )}

        {!campaign.isPublic && (
          <div
            className="flex items-start gap-2.5 rounded-2xl px-4 py-3"
            style={{ background: 'color-mix(in srgb, var(--tg-theme-hint-color, #8E8E93) 8%, transparent)' }}
          >
            <span className="text-[14px] leading-none mt-0.5">ℹ️</span>
            <span className="text-[13px] leading-relaxed" style={{ color: 'var(--tg-theme-hint-color, #8E8E93)' }}>
              {t('privateCampaignNote')}
            </span>
          </div>
        )}

        <div>
          <h2 className="font-bold mb-2.5" style={{ fontSize: 17, color: 'var(--tg-theme-text-color, #1C1C1E)' }}>{t('story')}</h2>
          <p className="leading-relaxed whitespace-pre-line" style={{ fontSize: 15, color: 'var(--tg-theme-text-color, #3a3a3c)', lineHeight: 1.6 }}>
            {campaign.story}
          </p>
        </div>

        <CampaignDonations donations={donations} />
      </div>

      </div>

      <CampaignBottomBar
        campaign={campaign}
        handleShare={handleShare}
        canDonate={canDonate}
        setDonateOpen={setDonateOpen}
        canClaim={canClaim}
        isCreator={isCreator}
        isDeployFailed={isDeployFailed}
        retryDeployPending={retryDeploy.isPending}
        handleRetryDeploy={handleRetryDeploy}
        retryError={retryError}
        isCompleted={isCompleted}
        bottomCompletedLabel={bottomCompletedLabel}
        bottomCompletedColor={bottomCompletedColor}
        isExpired={isExpired}
        isFrozen={isFrozen}
        blockedDonationLabel={blockedDonationLabel}
      />

      {isPhotoViewerOpen && activePhoto && (
        <PhotoViewer
          photos={campaign.photos}
          title={campaign.title}
          activeIndex={activePhotoIndex}
          onClose={() => setIsPhotoViewerOpen(false)}
          onPrevious={showPreviousPhoto}
          onNext={showNextPhoto}
        />
      )}

      {donateOpen && (
        <DonateModal
          campaign={campaign}
          onClose={() => setDonateOpen(false)}
          onDonationSubmitted={handleDonationSubmitted}
          donationConfirmed={donationConfirmed}
        />
      )}
    </div>
  )
}
