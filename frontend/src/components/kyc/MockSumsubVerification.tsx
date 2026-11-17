import { useTranslation } from 'react-i18next'
import type { MockKycResult } from '../../api/kyc'
import { getKycVerificationSteps, type KycVerificationLevel } from '../../constants/kycLevels'

interface Props {
  currentStep: number
  targetLevel: KycVerificationLevel
  targetTitle: string
  isCompleting: boolean
  error?: string | null
  onBack: () => void
  onStepForward: () => void
  onComplete: (result: MockKycResult) => void
}

type Translate = (key: string, options?: Record<string, unknown>) => string

function Progress({ currentStep, steps, t }: { currentStep: number; steps: string[]; t: Translate }) {
  return (
    <div className="border-t border-[color-mix(in_srgb,var(--tg-theme-hint-color,#8E8E93)_16%,transparent)] bg-[var(--tg-theme-bg-color,#fff)] px-6 pb-4 pt-4">
      <div className="mb-3 text-center text-[12.5px] font-medium text-[var(--tg-theme-hint-color,#8E8E93)]">
        {t('sdk.stepOf', { current: Math.min(currentStep + 1, steps.length), total: steps.length })}
      </div>
      <div className="flex items-start gap-2">
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
          </div>
        ))}
      </div>
      <div className="mt-4 flex h-6 items-center justify-center">
        <div className="h-[5px] w-[134px] rounded bg-[var(--tg-theme-text-color,#1C1C1E)] opacity-80" />
      </div>
    </div>
  )
}

function stepTitle(step: string, targetTitle: string, t: Translate): string {
  return t(`mock.titles.${step}`, { defaultValue: t('mock.titles.fallback', { title: targetTitle }) })
}

function stepDescription(step: string, targetLevel: KycVerificationLevel, t: Translate): string {
  return t(`mock.descriptions.${step}`, { defaultValue: t('mock.descriptions.fallback', { level: targetLevel }) })
}

function stepActionLabel(step: string, t: Translate): string {
  if (step === 'address') return t('mock.actions.uploadDocument')
  if (step === 'video1' || step === 'video2') return t('mock.actions.recordVideo')
  if (step === 'campaigns') return t('mock.actions.checkCampaigns')
  if (step === 'organization') return t('mock.actions.continue')
  if (step === 'representative') return t('mock.actions.confirm')
  return step === 'document' ? t('mock.actions.photoDocument') : t('mock.actions.selfie')
}

export function MockSumsubVerification({
  currentStep,
  targetLevel,
  targetTitle,
  isCompleting,
  error,
  onBack,
  onStepForward,
  onComplete,
}: Props) {
  const { t } = useTranslation('kyc')
  const steps = getKycVerificationSteps(targetLevel)
  const currentLabel = steps[Math.min(currentStep, steps.length - 1)] ?? 'processing'
  const isFinalStep = currentStep >= steps.length - 1
  const captureLabel = stepActionLabel(currentLabel, t)

  return (
    <div className="tg-app-viewport flex flex-col bg-[var(--tg-theme-bg-color,#fff)] text-[var(--tg-theme-text-color,#1C1C1E)]">
      <div className="relative flex h-[50px] shrink-0 items-center border-b border-[color-mix(in_srgb,var(--tg-theme-hint-color,#8E8E93)_16%,transparent)] px-3">
        <button
          onClick={onBack}
          className="flex h-10 w-10 items-center justify-center text-[var(--tg-theme-link-color,#007AFF)] transition-opacity active:opacity-70 focus:outline-none focus:ring-2 focus:ring-[var(--tg-theme-link-color,#007AFF)] focus:ring-offset-2"
          aria-label={t('common.back')}
        >
          <svg width="22" height="22" viewBox="0 0 16 16" fill="none">
            <path d="M10 13L5 8l5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h1 className="pointer-events-none absolute inset-x-0 text-center text-[16px] font-semibold">
          KYC {targetLevel}
        </h1>
      </div>

      <div className="min-h-0 flex-1 p-3.5">
        <div className="relative flex h-full flex-col overflow-hidden rounded-[18px] border border-[color-mix(in_srgb,var(--tg-theme-hint-color,#8E8E93)_16%,transparent)] bg-[var(--tg-theme-secondary-bg-color,#F2F2F7)]">
          <div className="flex h-9 shrink-0 items-center justify-between border-b border-[color-mix(in_srgb,var(--tg-theme-hint-color,#8E8E93)_16%,transparent)] px-3.5">
            <span className="flex items-center gap-1.5 text-[11px] font-bold text-[var(--tg-theme-hint-color,#8E8E93)]">
              <span className="h-3.5 w-3.5 rounded bg-gradient-to-br from-[#0098EA] to-[#0060d6]" />
              Sumsub
            </span>
            <span className="flex items-center gap-1 text-[10.5px] font-medium text-[var(--tg-theme-hint-color,#8E8E93)]">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#1E9E52" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <rect x="4.5" y="10.5" width="15" height="10" rx="2.2" />
                <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
              </svg>
              {t('mock.secure')}
            </span>
          </div>

          <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-5 py-6 text-center">
            <div className="text-[15px] font-semibold leading-snug">
              {stepTitle(currentLabel, targetTitle, t)}
            </div>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-[var(--tg-theme-hint-color,#8E8E93)]">
              {stepDescription(currentLabel, targetLevel, t)}
            </p>

            <div className="relative my-6 h-[138px] w-[214px] overflow-hidden rounded-[12px] bg-[color-mix(in_srgb,var(--tg-theme-text-color,#1C1C1E)_5%,transparent)]">
              {!isFinalStep ? (
                <>
                  <div className="absolute inset-x-0 h-0.5 bg-[var(--tg-theme-button-color,#007AFF)] shadow-[0_0_10px_var(--tg-theme-button-color,#007AFF)] motion-safe:animate-[hw-scan_2.4s_ease-in-out_infinite]" />
                  <svg width="100%" height="100%" viewBox="0 0 214 138" fill="none" className="absolute inset-0">
                    <g stroke="var(--tg-theme-button-color,#007AFF)" strokeWidth="3" strokeLinecap="round">
                      <path d="M10 30V16a6 6 0 0 1 6-6h14" />
                      <path d="M204 30V16a6 6 0 0 0-6-6h-14" />
                      <path d="M10 108v14a6 6 0 0 0 6 6h14" />
                      <path d="M204 108v14a6 6 0 0 1-6 6h-14" />
                    </g>
                  </svg>
                </>
              ) : (
                <div className="flex h-full items-center justify-center">
                  <span className="h-9 w-9 rounded-full border-4 border-[var(--tg-theme-button-color,#007AFF)] border-t-transparent motion-safe:animate-spin" />
                </div>
              )}
            </div>

            {error && (
              <div className="mb-3 w-full rounded-[12px] border border-[rgba(217,48,37,.18)] bg-[rgba(217,48,37,.08)] px-3 py-2 text-left text-[12.5px] leading-relaxed text-[#D93025]">
                {error}
              </div>
            )}

            {isFinalStep ? (
              <div className="grid w-full grid-cols-1 gap-2">
                <button
                  onClick={() => onComplete('approved')}
                  disabled={isCompleting}
                  className="min-h-[46px] rounded-[14px] bg-[var(--tg-theme-button-color,#007AFF)] px-4 text-[15.5px] font-semibold text-[var(--tg-theme-button-text-color,#fff)] transition-opacity active:opacity-80 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-[var(--tg-theme-link-color,#007AFF)] focus:ring-offset-2"
                >
                  {isCompleting ? t('mock.actions.saving') : t('mock.actions.complete')}
                </button>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => onComplete('rejected_retry')}
                    disabled={isCompleting}
                    className="min-h-[44px] rounded-[12px] bg-[var(--tg-theme-bg-color,#fff)] px-3 text-[13.5px] font-semibold text-[#D93025] transition-opacity active:opacity-80 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-[#D93025] focus:ring-offset-2"
                  >
                    {t('mock.actions.rejectRetry')}
                  </button>
                  <button
                    onClick={() => onComplete('rejected_final')}
                    disabled={isCompleting}
                    className="min-h-[44px] rounded-[12px] bg-[var(--tg-theme-bg-color,#fff)] px-3 text-[13.5px] font-semibold text-[#D93025] transition-opacity active:opacity-80 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-[#D93025] focus:ring-offset-2"
                  >
                    {t('mock.actions.rejectFinal')}
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={onStepForward}
                className="flex h-[60px] w-[60px] items-center justify-center rounded-full bg-[var(--tg-theme-button-color,#007AFF)] transition-opacity active:opacity-80 focus:outline-none focus:ring-2 focus:ring-[var(--tg-theme-link-color,#007AFF)] focus:ring-offset-2"
                aria-label={captureLabel}
              >
                <span className="h-[46px] w-[46px] rounded-full border-[3px] border-[var(--tg-theme-button-text-color,#fff)]" />
              </button>
            )}
          </div>
        </div>
      </div>

      <Progress currentStep={currentStep} steps={steps} t={t} />
    </div>
  )
}
