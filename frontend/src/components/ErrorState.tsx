import { useTranslation } from 'react-i18next'

interface ErrorStateProps {
  message?: string
  onRetry?: () => void
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 gap-3">
      <span className="text-4xl">⚠️</span>
      <p className="text-sm text-gray-500 text-center">{message ?? t('common.error')}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="px-4 py-2 rounded-xl bg-[var(--tg-theme-button-color,var(--tg-brand-color))] text-white text-sm font-semibold active:opacity-80 transition-opacity"
        >
          {t('common.retry')}
        </button>
      )}
    </div>
  )
}
