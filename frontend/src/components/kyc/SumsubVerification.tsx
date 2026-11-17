import SumsubWebSdk from '@sumsub/websdk-react'
import { useTranslation } from 'react-i18next'
import { getKycVerificationSteps, type KycVerificationLevel } from '../../constants/kycLevels'

export interface SumsubVerificationProps {
  accessToken: string
  onTokenExpired: () => Promise<string>
  onStatusChange: (status: string) => void
  currentStep: number
  targetLevel: KycVerificationLevel
  onBack: () => void
}

export function SumsubVerification({
  accessToken,
  onTokenExpired,
  onStatusChange,
  currentStep,
  targetLevel,
  onBack,
}: SumsubVerificationProps) {
  const { t, i18n } = useTranslation('kyc')
  const steps = getKycVerificationSteps(targetLevel)

  return (
    <div className="tg-app-viewport flex flex-col bg-[var(--tg-theme-bg-color,#fff)] text-[var(--tg-theme-text-color,#1C1C1E)]">
      <div className="relative flex h-[50px] shrink-0 items-center border-b border-[color-mix(in_srgb,var(--tg-theme-hint-color,#8E8E93)_16%,transparent)] px-3">
        <button
          onClick={onBack}
          className="flex h-10 w-10 items-center justify-center text-[var(--tg-theme-link-color,#007AFF)] transition-opacity active:opacity-70 focus:outline-none focus:ring-2 focus:ring-[var(--tg-theme-link-color,#007AFF)] focus:ring-offset-2"
          aria-label={t('common.back')}
        >
          <svg width="22" height="22" viewBox="0 0 16 16" fill="none">
            <path
              d="M10 13L5 8l5-5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <h1 className="pointer-events-none absolute inset-x-0 text-center text-[16px] font-semibold">
          {t('common.verification')}
        </h1>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        <SumsubWebSdk
          accessToken={accessToken}
          expirationHandler={onTokenExpired}
          onMessage={(type: string, payload: unknown) => {
            if (type === 'idCheck.onApplicantStatusChanged') {
              const p = payload as { reviewResult?: { reviewAnswer?: string } }
              const answer = p?.reviewResult?.reviewAnswer
              if (answer) onStatusChange(answer)
            }
          }}
          config={{ lang: i18n.language }}
          options={{ adaptIframeHeight: true, addViewportTag: false }}
          style={{ height: '100%' }}
        />
      </div>

      <div className="border-t border-[color-mix(in_srgb,var(--tg-theme-hint-color,#8E8E93)_16%,transparent)] bg-[var(--tg-theme-bg-color,#fff)] px-6 pb-4 pt-4">
        <div className="mb-3 text-center text-[12.5px] font-medium text-[var(--tg-theme-hint-color,#8E8E93)]">
          {t('sdk.stepOf', { current: Math.min(currentStep + 1, steps.length), total: steps.length })}
        </div>
        <div className="flex items-center gap-2">
          {steps.map((step, i) => (
            <div key={step} className="flex flex-1 flex-col items-center gap-2">
              <div
                className={`h-1 w-full rounded-full transition-colors ${
                  i <= currentStep
                    ? 'bg-[var(--tg-theme-button-color,#007AFF)]'
                    : 'bg-[color-mix(in_srgb,var(--tg-theme-hint-color,#8E8E93)_18%,transparent)]'
                }`}
              />
              <span
                className={`text-[11px] font-medium ${
                  i <= currentStep
                    ? 'text-[var(--tg-theme-link-color,#007AFF)]'
                    : 'text-[var(--tg-theme-hint-color,#8E8E93)]'
                }`}
              >
                {t(`steps.${step}`)}
              </span>
              <span className="sr-only">
                {i <= currentStep ? t('sdk.doneStep') : t('sdk.waitingStep')}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-4 flex h-6 items-center justify-center">
          <div className="h-[5px] w-[134px] rounded bg-[var(--tg-theme-text-color,#1C1C1E)] opacity-80" />
        </div>
      </div>
    </div>
  )
}
