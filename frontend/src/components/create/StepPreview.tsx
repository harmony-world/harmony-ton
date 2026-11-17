import { useTranslation } from 'react-i18next'
import { shortTonAddress, tonAddressesMatch } from '../../utils/tonAddress'
import type { CampaignCategory } from '../../types'
import type { OrganizerType } from '../../api/campaigns'
import { getCampaignCategoryLabel } from '../../constants/campaignCategories'
import type { DraftPhoto } from '../../types/createCampaign'
import { formatDate } from '../../utils/format'

interface PreviewData {
  title: string
  category: CampaignCategory | ''
  story: string
  photos: DraftPhoto[]
  goalAmount: string
  deadline: string
  payoutAddress: string
  organizerType: OrganizerType
  channelLink: string
  orgName: string
  isPublic: boolean
}

interface Props {
  data: PreviewData
  isSubmitting: boolean
  apiError: string | null
  liveWalletAddress?: string
  onSubmit: () => void
}

export function StepPreview({ data, isSubmitting, apiError, liveWalletAddress, onSubmit }: Props) {
  const { t, i18n } = useTranslation('create')
  const previewUrl = data.photos[0]?.url ?? null
  const payoutMismatch = Boolean(
    liveWalletAddress &&
    data.payoutAddress &&
    !tonAddressesMatch(liveWalletAddress, data.payoutAddress),
  )

  const ORGANIZER_LABELS: Record<OrganizerType, string> = {
    telegram_channel: t('preview.organizerChannel'),
    organization: t('preview.organizerOrg'),
    personal: t('preview.organizerPersonal'),
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-[var(--tg-theme-hint-color,#8E8E93)]">{t('preview.checkData')}</p>

      <div className="bg-[var(--tg-theme-secondary-bg-color,#fff)] rounded-[18px] overflow-hidden" style={{ border: '1px solid color-mix(in srgb, var(--tg-theme-hint-color, #8E8E93) 12%, transparent)' }}>
        {previewUrl && (
          <div className="relative">
            <img src={previewUrl} alt="" className="w-full h-44 object-cover" />
            <div className="absolute left-3 top-3 rounded-full px-2.5 py-1 text-[11px] font-semibold text-white bg-[var(--tg-brand-color)]">
              {t('preview.mainPhoto')}
            </div>
            {data.photos.length > 1 && (
              <div className="absolute right-3 top-3 rounded-full px-2.5 py-1 text-[11px] font-semibold text-white" style={{ background: 'rgba(20,24,32,.58)' }}>
                1 / {data.photos.length}
              </div>
            )}
          </div>
        )}
        {!previewUrl && (
          <div className="w-full h-32 bg-gradient-to-br from-[var(--tg-brand-color)]/10 to-[var(--tg-brand-color)]/5 flex items-center justify-center">
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
              <rect x="4" y="8" width="32" height="24" rx="4" stroke="var(--tg-brand-color)" strokeWidth="1.5" opacity="0.4" />
              <circle cx="14" cy="17" r="3" stroke="var(--tg-brand-color)" strokeWidth="1.5" opacity="0.4" />
              <path d="M4 27l10-7 7 6 5-4 10 5" stroke="var(--tg-brand-color)" strokeWidth="1.5" strokeLinejoin="round" opacity="0.4" />
            </svg>
          </div>
        )}

        <div className="p-4 flex flex-col gap-3">
          {data.category && (
            <span className="self-start text-xs font-medium text-[var(--tg-brand-color)] bg-[var(--tg-brand-color)]/10 px-2 py-0.5 rounded-full">
              {getCampaignCategoryLabel(data.category)}
            </span>
          )}

          <h3 className="text-base font-semibold text-[var(--tg-theme-text-color,#1C1C1E)] leading-tight">
            {data.title || '—'}
          </h3>

          {data.story && (
            <p className="text-sm text-[var(--tg-theme-text-color,#3C3C43)] line-clamp-3 leading-relaxed">
              {data.story}
            </p>
          )}

          <div className="flex flex-col gap-1.5 pt-1 border-t border-[var(--tg-theme-secondary-bg-color,#F2F2F7)]">
            <div className="flex justify-between items-center text-sm">
              <span className="text-[var(--tg-theme-hint-color,#8E8E93)]">{t('preview.goalLabel')}</span>
              <span className="font-semibold text-[var(--tg-theme-text-color,#1C1C1E)]">
                {data.goalAmount ? `$${Number(data.goalAmount).toLocaleString()}` : '—'}
              </span>
            </div>
            {data.deadline && (
              <div className="flex justify-between items-center text-sm">
                <span className="text-[var(--tg-theme-hint-color,#8E8E93)]">{t('preview.deadlineLabel')}</span>
                <span className="text-[var(--tg-theme-text-color,#1C1C1E)]">{formatDate(data.deadline, i18n.language)}</span>
              </div>
            )}
            <div className="flex justify-between items-center text-sm">
              <span className="text-[var(--tg-theme-hint-color,#8E8E93)]">{t('preview.typeLabel')}</span>
              <span className="text-[var(--tg-theme-text-color,#1C1C1E)]">{ORGANIZER_LABELS[data.organizerType]}</span>
            </div>
            <div className="flex justify-between items-center gap-3 text-sm">
              <span className="text-[var(--tg-theme-hint-color,#8E8E93)]">{t('preview.visibilityLabel')}</span>
              <span className="text-right text-[var(--tg-theme-text-color,#1C1C1E)]">
                {data.isPublic ? t('preview.publicVisibility') : t('preview.privateVisibility')}
              </span>
            </div>
            {data.organizerType === 'telegram_channel' && data.channelLink && (
              <div className="flex justify-between items-center text-sm">
                <span className="text-[var(--tg-theme-hint-color,#8E8E93)]">{t('preview.channelLabel')}</span>
                <span className="text-[var(--tg-theme-text-color,#1C1C1E)] truncate max-w-[180px]">{data.channelLink}</span>
              </div>
            )}
            {data.organizerType === 'organization' && data.orgName && (
              <div className="flex justify-between items-center text-sm">
                <span className="text-[var(--tg-theme-hint-color,#8E8E93)]">{t('preview.orgLabel')}</span>
                <span className="text-[var(--tg-theme-text-color,#1C1C1E)] truncate max-w-[180px]">{data.orgName}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {apiError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3">
          <p className="text-sm text-red-600">{apiError}</p>
        </div>
      )}

      {payoutMismatch && (
        <div className="border rounded-xl p-3" style={{ borderColor: 'rgba(255,149,0,.35)', background: 'rgba(255,149,0,.08)' }}>
          <p className="text-sm leading-snug" style={{ color: '#B85C00' }}>
            {t('preview.payoutMismatch', { payout: shortTonAddress(data.payoutAddress), connected: shortTonAddress(liveWalletAddress!) })}
          </p>
        </div>
      )}

      <button
        type="button"
        onClick={onSubmit}
        disabled={isSubmitting}
        className="w-full py-3.5 rounded-[14px] bg-[var(--tg-brand-color)] text-white font-semibold text-base active:opacity-80 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {isSubmitting ? t('preview.submitting') : t('preview.submitBtn')}
      </button>

      <p className="text-xs text-[var(--tg-theme-hint-color,#8E8E93)] text-center leading-relaxed">
        {t('preview.moderationNote')}
      </p>
    </div>
  )
}
