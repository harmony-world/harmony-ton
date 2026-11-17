import { useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation } from '@tanstack/react-query'
import { campaignsApi, type OrganizerType, type ChannelVerification } from '../../api/campaigns'
import type { ApiError } from '../../api/client'
import { BOT_USERNAME } from '../../utils/env'

interface OrganizerState {
  organizerType: OrganizerType
  channelLink: string
  channelAutopost: boolean
  orgName: string
  orgInn: string
  orgDoc: File | null
}

interface Props {
  state: OrganizerState
  onChange: (patch: Partial<OrganizerState>) => void
  errors: Partial<Record<keyof OrganizerState, string>>
  onChannelVerified?: (verification: ChannelVerification) => void
  onChannelHasActiveCampaign?: () => void
}

const OPTION_VALUES: { value: OrganizerType; iconKey: string; labelKey: string; hintKey: string; badgeKey?: string }[] = [
  {
    value: 'telegram_channel',
    iconKey: 'create:organizer.channelIcon',
    labelKey: 'create:organizer.channel',
    hintKey: 'create:organizer.channelHint',
  },
  {
    value: 'personal',
    iconKey: 'create:organizer.personalIcon',
    labelKey: 'create:organizer.personal',
    hintKey: 'create:organizer.personalHint',
  },
  {
    value: 'organization',
    iconKey: 'create:organizer.organizationIcon',
    labelKey: 'create:organizer.organization',
    hintKey: 'create:organizer.organizationHint',
    badgeKey: 'create:organizer.organizationBadge',
  },
]

export function StepOrganizer({ state, onChange, errors, onChannelVerified, onChannelHasActiveCampaign }: Props) {
  const { t } = useTranslation('create')
  const [verification, setVerification] = useState<ChannelVerification | null>(null)
  const docRef = useRef<HTMLInputElement>(null)

  const {
    mutate: verifyChannel,
    isPending: channelLoading,
    error: channelError,
  } = useMutation<ChannelVerification, ApiError, string>({
    mutationFn: (link) => campaignsApi.verifyChannel(link),
    onSuccess: (data) => {
      setVerification(data)
      if (data.hasActiveCampaign) {
        onChannelHasActiveCampaign?.()
      } else {
        onChannelVerified?.(data)
      }
    },
  })

  function handleChannelCheck() {
    if (state.channelLink.trim()) {
      setVerification(null)
      verifyChannel(state.channelLink.trim())
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-sm font-medium text-[var(--tg-theme-text-color,#1C1C1E)] mb-3">{t('organizer.typeLabel')}</p>
        <div className="flex flex-col gap-2">
          {OPTION_VALUES.filter((opt) => opt.value !== 'organization').map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange({ organizerType: opt.value })}
              className={`flex items-start gap-3 p-3.5 rounded-[14px] text-left transition-colors ${
                state.organizerType === opt.value
                  ? 'bg-[var(--tg-brand-color)]/5'
                  : 'bg-[var(--tg-theme-secondary-bg-color,#fff)]'
              }`}
              style={{
                border: state.organizerType === opt.value
                  ? '1px solid var(--tg-brand-color)'
                  : '1px solid color-mix(in srgb, var(--tg-theme-hint-color, #8E8E93) 12%, transparent)',
              }}
            >
              <div
                className={`w-5 h-5 rounded-full border-2 mt-0.5 shrink-0 flex items-center justify-center transition-colors ${
                  state.organizerType === opt.value
                    ? 'border-[var(--tg-brand-color)]'
                    : 'border-[var(--tg-theme-hint-color,#8E8E93)]'
                }`}
              >
                {state.organizerType === opt.value && (
                  <div className="w-2.5 h-2.5 rounded-full bg-[var(--tg-brand-color)]" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span>{t(opt.iconKey)}</span>
                  <span className="text-sm font-medium text-[var(--tg-theme-text-color,#1C1C1E)]">{t(opt.labelKey)}</span>
                  {opt.badgeKey && (
                    <span className="rounded-full bg-[var(--tg-theme-secondary-bg-color,#F2F2F7)] px-2 py-0.5 text-[10.5px] font-bold leading-none text-[var(--tg-theme-hint-color,#8E8E93)]">
                      {t(opt.badgeKey)}
                    </span>
                  )}
                </div>
                <p className="text-xs text-[var(--tg-theme-hint-color,#8E8E93)] leading-relaxed">{t(opt.hintKey)}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {state.organizerType === 'telegram_channel' && (
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-[var(--tg-theme-text-color,#1C1C1E)]">{t('organizer.channelLinkLabel')}</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={state.channelLink}
              onChange={(e) => onChange({ channelLink: e.target.value })}
              placeholder={t('organizer.channelPlaceholder')}
              className="input-base flex-1"
            />
            <button
              type="button"
              onClick={handleChannelCheck}
              disabled={channelLoading || !state.channelLink.trim()}
              className="px-3 py-2 rounded-xl bg-[var(--tg-brand-color)] text-white text-sm font-medium active:opacity-80 disabled:opacity-50 transition-opacity shrink-0"
            >
              {channelLoading ? '...' : t('organizer.verifyBtn')}
            </button>
          </div>
          {verification && (
            <div className="flex flex-col gap-2 mt-1">
              <div className="flex items-center gap-2 p-2.5 bg-[var(--tg-theme-secondary-bg-color,#F2F2F7)] rounded-xl">
                {verification.avatarUrl && (
                  <img
                    src={verification.avatarUrl}
                    alt=""
                    className="w-8 h-8 rounded-full object-cover"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-[var(--tg-theme-text-color,#1C1C1E)] truncate">{verification.name}</p>
                  <p className="text-xs text-[var(--tg-theme-hint-color,#8E8E93)]">
                    {verification.subscribers.toLocaleString()} {t('organizer.subscribers')}
                    {verification.subscribers >= 1000 && (
                      <span className="ml-1 text-[#34C759]">{t('organizer.highTrust')}</span>
                    )}
                  </p>
                </div>
                <span className="text-xs px-2 py-0.5 rounded-full bg-[#34C759]/10 text-[#34C759]">
                  {verification.userRole === 'creator' ? t('organizer.roleOwner') : t('organizer.roleAdmin')}
                </span>
              </div>
              {verification.botIsAdmin && !verification.hasActiveCampaign && (
                <label className="flex items-center gap-2.5 p-2.5 bg-[var(--tg-theme-secondary-bg-color,#F2F2F7)] rounded-xl cursor-pointer">
                  <input
                    type="checkbox"
                    checked={state.channelAutopost}
                    onChange={(e) => onChange({ channelAutopost: e.target.checked })}
                    className="w-4 h-4 rounded accent-[var(--tg-brand-color)]"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-[var(--tg-theme-text-color,#1C1C1E)]">{t('organizer.autopostLabel')}</p>
                    <p className="text-xs text-[var(--tg-theme-hint-color,#8E8E93)] leading-relaxed">
                      {t('organizer.autopostHint')}
                    </p>
                  </div>
                </label>
              )}
              {!verification.botIsAdmin && !verification.hasActiveCampaign && (
                <p className="text-xs text-[var(--tg-theme-hint-color,#8E8E93)]">
                  {t('organizer.addBotHint')}
                </p>
              )}
            </div>
          )}
          {channelError && (
            (channelError as ApiError)?.code === 'BOT_NOT_IN_CHANNEL' ? (
              <div className="mt-1 p-3 rounded-xl bg-[#FF9500]/10 text-[#FF9500]">
                <p className="text-xs font-medium mb-1.5">{t('organizer.botNotInChannel')}</p>
                <ol className="text-xs list-decimal list-inside space-y-1 opacity-90">
                  <li>{t('organizer.botStep1')}</li>
                  <li>{t('organizer.botStep2', { bot: BOT_USERNAME })}</li>
                  <li>{t('organizer.botStep3')}
                    <ul className="list-disc list-inside ml-3 mt-0.5 space-y-0.5">
                      <li>{t('organizer.botStep3Right')}</li>
                    </ul>
                  </li>
                  <li>{t('organizer.botStep4')}</li>
                </ol>
              </div>
            ) : (
              <p className="text-xs text-red-500">
                {(channelError as ApiError)?.message ?? t('organizer.channelNotFound')}
              </p>
            )
          )}
          {errors.channelLink && (
            <p className="text-xs text-red-500">{errors.channelLink}</p>
          )}
        </div>
      )}

      {state.organizerType === 'organization' && (
        <div className="flex flex-col gap-3">
          <div
            className="rounded-[14px] border px-3.5 py-3 text-[13px] leading-relaxed"
            style={{
              background: 'color-mix(in srgb, #FF9500 10%, var(--tg-theme-bg-color, #fff))',
              borderColor: 'color-mix(in srgb, #FF9500 26%, transparent)',
              color: 'var(--tg-theme-text-color,#1C1C1E)',
            }}
          >
            {t('organizer.orgNotice')}
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="campaign-org-name" className="text-sm font-medium text-[var(--tg-theme-text-color,#1C1C1E)]">{t('organizer.orgNameLabel')}</label>
            <input
              id="campaign-org-name"
              type="text"
              value={state.orgName}
              onChange={(e) => onChange({ orgName: e.target.value })}
              placeholder={t('organizer.orgNamePlaceholder')}
              className="input-base"
            />
            {errors.orgName && <p className="text-xs text-red-500">{errors.orgName}</p>}
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="campaign-org-inn" className="text-sm font-medium text-[var(--tg-theme-text-color,#1C1C1E)]">{t('organizer.orgInnLabel')}</label>
            <input
              id="campaign-org-inn"
              type="text"
              value={state.orgInn}
              onChange={(e) => onChange({ orgInn: e.target.value })}
              placeholder="1234567890"
              inputMode="numeric"
              maxLength={12}
              className="input-base"
            />
            {errors.orgInn && <p className="text-xs text-red-500">{errors.orgInn}</p>}
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="campaign-org-doc" className="text-sm font-medium text-[var(--tg-theme-text-color,#1C1C1E)]">{t('organizer.orgDocLabel')}</label>
            <input
              id="campaign-org-doc"
              ref={docRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              className="hidden"
              onChange={(e) => onChange({ orgDoc: e.target.files?.[0] ?? null })}
            />
            <button
              type="button"
              onClick={() => docRef.current?.click()}
              className="flex items-center gap-2 px-3 py-2.5 border border-dashed rounded-xl text-sm text-[var(--tg-theme-hint-color,#8E8E93)] active:opacity-70 transition-opacity"
              style={{ borderColor: 'color-mix(in srgb, var(--tg-theme-hint-color, #8E8E93) 25%, transparent)' }}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M9 2v10M5 6l4-4 4 4" stroke="#8E8E93" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M3 13v1a1 1 0 001 1h10a1 1 0 001-1v-1" stroke="#8E8E93" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              {state.orgDoc ? state.orgDoc.name : t('organizer.orgDocPlaceholder')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
