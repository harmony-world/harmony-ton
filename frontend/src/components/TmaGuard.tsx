import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useTelegramApp } from '../hooks/useTelegramApp'
import { IS_DEV } from '../utils/env'

interface Props {
  children: ReactNode
}

export function TmaGuard({ children }: Props) {
  const { isTMA } = useTelegramApp()
  const { t } = useTranslation()

  if (!isTMA && !IS_DEV) {
    return (
      <div className="flex flex-col items-center justify-center min-h-dvh gap-4 p-6 text-center">
        <p className="text-lg font-medium">{t('tmaGuard.title')}</p>
        <p className="text-sm text-gray-500">{t('tmaGuard.subtitle')}</p>
      </div>
    )
  }

  return <>{children}</>
}
