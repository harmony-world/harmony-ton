import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { CampaignCategory } from '../types'
import { campaignsApi, type CreateCampaignBody } from '../api/campaigns'
import { kycApi } from '../api/kyc'
import { useWalletState } from '../hooks/useWalletState'
import { StepOrganizer } from '../components/create/StepOrganizer'
import { StepDetails } from '../components/create/StepDetails'
import { StepGoal } from '../components/create/StepGoal'
import { StepPreview } from '../components/create/StepPreview'
import { isDraftMeaningful } from '../utils/campaignDraft'
import { clearDraft, getDraftEditStep, INITIAL, loadDraft, saveDraft, validateStep, type StepErrors, type WizardState } from '../utils/createCampaignWizard'

const STEP_LABEL_KEYS = ['create:stepOrganizer', 'create:stepDetails', 'create:stepGoal', 'create:stepPreview']

export function CreateCampaignPage() {
  const { t } = useTranslation('create')
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [draft] = useState(loadDraft)
  const [step, setStep] = useState(draft?.step ?? 0)
  const [state, setState] = useState<WizardState>(() => ({ ...INITIAL, ...draft?.state }))
  const [draftCreatedAt, setDraftCreatedAt] = useState(draft?.createdAt ?? new Date().toISOString())
  const [errors, setErrors] = useState<StepErrors>({})
  const [submitted, setSubmitted] = useState(false)
  const [channelVerified, setChannelVerified] = useState(false)
  const [channelHasActiveCampaign, setChannelHasActiveCampaign] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)
  const [showDraftBanner, setShowDraftBanner] = useState(() => !!draft && isDraftMeaningful(draft.state))
  const [isCropping, setIsCropping] = useState(false)
  const { liveAddress, serverAddress, effectivePayoutAddress, isLiveConnected } = useWalletState()
  const manuallyEdited = useRef(false)

  const restoredStep = draft?.step ?? 0

  const { data: kycStatus } = useQuery({
    queryKey: ['kycStatus'],
    queryFn: () => kycApi.getStatus(),
  })

  const { data: rateLimit } = useQuery({
    queryKey: ['campaignRateLimit'],
    queryFn: () => campaignsApi.getRateLimit(),
  })

  const goalMaxUsd =
    kycStatus && 'campaignGoalMaxUsd' in kycStatus
      ? (kycStatus.campaignGoalMaxUsd ?? Number.POSITIVE_INFINITY)
      : undefined

  const isRateLimited = rateLimit?.blocked === true
  const isOrganizationFlowBlocked = step === 0 && state.organizerType === 'organization'

  useEffect(() => {
    if (kycStatus && kycStatus.kycLevel < 2) {
      navigate('/kyc', { replace: true, state: { returnTo: '/create' } })
    }
  }, [kycStatus, navigate])

  useEffect(() => {
    if (effectivePayoutAddress && !manuallyEdited.current && !state.payoutAddress) {
      setState((prev) => ({ ...prev, payoutAddress: effectivePayoutAddress }))
    }
  }, [effectivePayoutAddress, state.payoutAddress])

  useEffect(() => {
    saveDraft(state, step, draftCreatedAt)
  }, [state, step, draftCreatedAt])

  const { mutateAsync: createCampaign, isPending } = useMutation({
    mutationFn: (body: CreateCampaignBody) => campaignsApi.create(body),
  })

  function patch(update: Partial<WizardState>) {
    if ('category' in update && update.category === 'birthday') {
      update.isPublic = false
    }
    setState((prev) => ({ ...prev, ...update }))
    if ('channelLink' in update || 'organizerType' in update) {
      setChannelVerified(false)
      setChannelHasActiveCampaign(false)
    }
    if (submitted) {
      const next = { ...state, ...update }
      const verified = 'channelLink' in update || 'organizerType' in update ? false : channelVerified
      const hasActive = 'channelLink' in update || 'organizerType' in update ? false : channelHasActiveCampaign
      setErrors(
        validateStep(
          step,
          next,
          { channelVerified: verified, channelHasActiveCampaign: hasActive, goalMaxUsd },
          t,
        ),
      )
    }
  }

  function handleNext() {
    const errs = validateStep(step, state, { channelVerified, channelHasActiveCampaign, goalMaxUsd }, t)
    if (Object.keys(errs).length > 0) {
      setErrors(errs)
      setSubmitted(true)
      return
    }
    setErrors({})
    setSubmitted(false)
    setStep((s) => s + 1)
  }

  function handleBack() {
    setErrors({})
    setSubmitted(false)
    setStep((s) => s - 1)
  }

  async function handleSubmit() {
    setApiError(null)
    try {
      const body: CreateCampaignBody = {
        title: state.title,
        story: state.story,
        category: state.category as CampaignCategory,
        goal_amount_usd: Number(state.goalAmount),
        deadline: state.deadline,
        payout_address: state.payoutAddress,
        photos: state.photos.map((photo) => photo.url),
        organizer_type: state.organizerType,
        is_public: state.isPublic,
        photos_illustrative: state.photosIllustrative === true,
        ...(state.organizerType === 'telegram_channel' && state.channelLink.trim()
          ? { channel_link: state.channelLink.trim(), channel_autopost: state.channelAutopost }
          : {}),
      }
      const campaign = await createCampaign(body)
      void queryClient.invalidateQueries({ queryKey: ['campaigns'] })
      void queryClient.invalidateQueries({ queryKey: ['userCampaigns'] })
      clearDraft()
      if (campaign.status === 'rejected' && campaign.autoModeration) {
        navigate('/campaign-rejected', {
          replace: true,
          state: { message: campaign.autoModeration.message ?? undefined },
        })
        return
      }
      navigate(`/campaign/${campaign.id}`)
    } catch (err) {
      setApiError(err instanceof Error ? err.message : t('createError'))
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--tg-theme-bg-color,#fff)]">
      <div className="shrink-0 px-4 pt-4 pb-3 border-b border-[var(--tg-theme-secondary-bg-color,#F2F2F7)]">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-base font-semibold text-[var(--tg-theme-text-color,#1C1C1E)]">{t('title')}</h1>
          <span className="text-xs text-[var(--tg-theme-hint-color,#8E8E93)]">{step + 1} / {STEP_LABEL_KEYS.length}</span>
        </div>

        <div className="flex items-center gap-1.5">
          {STEP_LABEL_KEYS.map((key, i) => (
            <div key={key} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center gap-1">
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold transition-colors ${
                    i < step
                      ? 'bg-[#34C759] text-white'
                      : i === step
                        ? 'bg-[var(--tg-brand-color)] text-white'
                        : 'bg-[var(--tg-theme-secondary-bg-color,#F2F2F7)] text-[var(--tg-theme-hint-color,#8E8E93)]'
                  }`}
                >
                  {i < step ? (
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6l3 3 5-6" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : (
                    i + 1
                  )}
                </div>
                <span className={`text-[9px] whitespace-nowrap ${i === step ? 'text-[var(--tg-brand-color)]' : 'text-[var(--tg-theme-hint-color,#8E8E93)]'}`}>
                  {t(key)}
                </span>
              </div>
              {i < STEP_LABEL_KEYS.length - 1 && (
                <div
                  className={`flex-1 h-0.5 mb-4 mx-1 transition-colors ${
                    i < step ? 'bg-[#34C759]' : 'bg-[var(--tg-theme-secondary-bg-color,#F2F2F7)]'
                  }`}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-5 pb-6">
        {showDraftBanner && (
          <div
            className="mb-4 rounded-[16px] border px-4 py-3.5"
            style={{
              background: 'var(--tg-theme-secondary-bg-color, Canvas)',
              borderColor: 'color-mix(in srgb, var(--tg-theme-hint-color, CanvasText) 18%, transparent)',
            }}
          >
            <div className="flex items-center gap-3">
              <span
                className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px]"
                style={{
                  background: 'color-mix(in srgb, var(--tg-theme-link-color, var(--tg-theme-button-color, Highlight)) 16%, transparent)',
                  color: 'var(--tg-theme-link-color, var(--tg-theme-button-color, Highlight))',
                }}
                aria-hidden="true"
              >
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M3 12a9 9 0 1 0 3-6.7L3 8"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M3 3v5h5"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <span
                className="min-w-0 flex-1 text-[15px] font-semibold leading-snug"
                style={{ color: 'var(--tg-theme-text-color, CanvasText)' }}
              >
                {t('draftRestored')}
              </span>
            </div>
            {restoredStep > 0 && (
            <div className="mt-3.5 flex gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setErrors({})
                  setSubmitted(false)
                  setStep(getDraftEditStep(restoredStep))
                  setShowDraftBanner(false)
                }}
                className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-[11px] px-3 text-[14px] font-semibold active:opacity-80 focus:outline-none focus-visible:ring-2"
                style={{
                  background: 'var(--tg-theme-button-color, Highlight)',
                  color: 'var(--tg-theme-button-text-color, HighlightText)',
                  ['--tw-ring-color' as string]: 'var(--tg-theme-button-color, Highlight)',
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M12 20h9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  <path
                    d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                {t('draftEdit')}
              </button>
              <button
                type="button"
                onClick={() => {
                  clearDraft(state.photos)
                  setState(INITIAL)
                  setStep(0)
                  setShowDraftBanner(false)
                  setDraftCreatedAt(new Date().toISOString())
                  manuallyEdited.current = false
                }}
                className="min-h-11 shrink-0 rounded-[11px] border px-4 text-[14px] font-semibold active:opacity-80 focus:outline-none focus-visible:ring-2"
                style={{
                  background: 'transparent',
                  borderColor:
                    'color-mix(in srgb, var(--tg-theme-destructive-text-color, var(--tg-theme-link-color, var(--tg-theme-button-color, Highlight))) 40%, transparent)',
                  color: 'var(--tg-theme-destructive-text-color, var(--tg-theme-link-color, var(--tg-theme-button-color, Highlight)))',
                  ['--tw-ring-color' as string]:
                    'var(--tg-theme-destructive-text-color, var(--tg-theme-link-color, var(--tg-theme-button-color, Highlight)))',
                }}
              >
                {t('draftRestart')}
              </button>
            </div>
            )}
          </div>
        )}
        {step === 0 && isRateLimited && rateLimit && (
          <div
            className="mb-4 rounded-2xl px-4 py-3.5"
            style={{ background: 'color-mix(in srgb, #FF9500 12%, var(--tg-theme-bg-color, #fff))', border: '1px solid color-mix(in srgb, #FF9500 30%, transparent)' }}
          >
            <p className="text-[14px] font-semibold mb-1.5" style={{ color: '#FF9500' }}>
              {t('rateLimitTitle')}
            </p>
            <ul className="text-[13px] leading-[1.5] list-none p-0 m-0" style={{ color: 'var(--tg-theme-text-color, #1C1C1E)' }}>
              {rateLimit.limits.map((l) => (
                <li key={l.label} className={l.exceeded ? 'font-semibold' : ''}>
                  {l.exceeded ? '⛔' : '✓'} {t('rateLimitItem', { max: l.max, label: l.label, used: l.used })}
                </li>
              ))}
            </ul>
          </div>
        )}
        {step === 0 && (
          <StepOrganizer
            state={{
              organizerType: state.organizerType,
              channelLink: state.channelLink,
              channelAutopost: state.channelAutopost,
              orgName: state.orgName,
              orgInn: state.orgInn,
              orgDoc: state.orgDoc,
            }}
            onChange={patch}
            errors={errors}
            onChannelVerified={() => {
              setChannelVerified(true)
              setChannelHasActiveCampaign(false)
              setErrors((prev) => {
                const next = { ...prev }
                delete next.channelLink
                return next
              })
            }}
            onChannelHasActiveCampaign={() => {
              setChannelVerified(false)
              setChannelHasActiveCampaign(true)
              setErrors((prev) => ({
                ...prev,
                channelLink: t('validation.channelActive'),
              }))
            }}
          />
        )}
        {step === 1 && (
          <StepDetails
            state={{
              title: state.title,
              category: state.category,
              story: state.story,
              photos: state.photos,
              photosIllustrative: state.photosIllustrative,
            }}
            organizerType={state.organizerType}
            isPublic={state.isPublic}
            onIsPublicChange={(v: boolean) => patch({ isPublic: v })}
            onChange={patch}
            errors={errors}
            onCroppingChange={setIsCropping}
          />
        )}
        {step === 2 && (
          <StepGoal
            state={{
              goalAmount: state.goalAmount,
              deadline: state.deadline,
              payoutAddress: state.payoutAddress,
            }}
            onChange={(update) => {
              if ('payoutAddress' in update) manuallyEdited.current = true
              patch(update)
            }}
            errors={errors}
            liveWalletAddress={liveAddress}
            serverWalletAddress={serverAddress}
            isLiveConnected={isLiveConnected}
            goalMaxUsd={goalMaxUsd}
          />
        )}
        {step === 3 && (
          <StepPreview
            data={{
              title: state.title,
              category: state.category,
              story: state.story,
              photos: state.photos,
              goalAmount: state.goalAmount,
              deadline: state.deadline,
              payoutAddress: state.payoutAddress,
              organizerType: state.organizerType,
              channelLink: state.channelLink,
              orgName: state.orgName,
              isPublic: state.isPublic,
            }}
            isSubmitting={isPending}
            apiError={apiError}
            liveWalletAddress={liveAddress}
            onSubmit={() => void handleSubmit()}
          />
        )}
      </div>

      {step < 3 && !isCropping && (
        <div className="shrink-0 px-4 pb-4 pt-3 bg-[var(--tg-theme-bg-color,#fff)] border-t border-[var(--tg-theme-secondary-bg-color,#F2F2F7)] flex gap-3">
          {step > 0 && (
            <button
              type="button"
              onClick={handleBack}
              className="flex-1 py-3.5 rounded-[14px] font-semibold text-base active:opacity-80 transition-opacity"
              style={{
                border: '1px solid color-mix(in srgb, var(--tg-theme-hint-color, #8E8E93) 18%, transparent)',
                color: 'var(--tg-theme-text-color, #1C1C1E)',
              }}
            >
              {t('back')}
            </button>
          )}
          <button
            type="button"
            onClick={handleNext}
            disabled={(step === 0 && isRateLimited) || isOrganizationFlowBlocked}
            className="flex-1 py-3.5 rounded-[14px] bg-[var(--tg-brand-color)] text-white font-semibold text-base active:opacity-80 transition-opacity disabled:opacity-40"
          >
            {t('next')}
          </button>
        </div>
      )}
      {step === 3 && step > 0 && (
        <div className="shrink-0 px-4 pb-4 pt-3 bg-[var(--tg-theme-bg-color,#fff)] border-t border-[var(--tg-theme-secondary-bg-color,#F2F2F7)]">
          <button
            type="button"
            onClick={handleBack}
            className="w-full py-3 rounded-[14px] font-medium text-sm active:opacity-80 transition-opacity"
            style={{
              border: '1px solid color-mix(in srgb, var(--tg-theme-hint-color, #8E8E93) 18%, transparent)',
              color: 'var(--tg-theme-text-color, #1C1C1E)',
            }}
          >
            {t('back')}
          </button>
        </div>
      )}
    </div>
  )
}
