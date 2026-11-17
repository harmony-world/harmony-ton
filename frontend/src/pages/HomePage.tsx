import { useTranslation } from 'react-i18next'

export function HomePage() {
  const { t } = useTranslation('common')

  return (
    <div className="flex flex-col items-center justify-center min-h-dvh gap-6 p-6">
      <h1 className="text-2xl font-bold">HARMONY.WORLD</h1>
      <p className="text-center text-sm opacity-70">
        {t('home.tagline')}
      </p>
    </div>
  )
}
