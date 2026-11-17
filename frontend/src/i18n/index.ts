import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

import ruCommon from './locales/ru/common.json'
import ruFeed from './locales/ru/feed.json'
import ruCreate from './locales/ru/create.json'
import ruCampaign from './locales/ru/campaign.json'
import ruProfile from './locales/ru/profile.json'
import ruWallet from './locales/ru/wallet.json'
import ruSupport from './locales/ru/support.json'
import ruKyc from './locales/ru/kyc.json'
import ruLeaderboard from './locales/ru/leaderboard.json'
import enCommon from './locales/en/common.json'
import enFeed from './locales/en/feed.json'
import enCreate from './locales/en/create.json'
import enCampaign from './locales/en/campaign.json'
import enProfile from './locales/en/profile.json'
import enWallet from './locales/en/wallet.json'
import enSupport from './locales/en/support.json'
import enKyc from './locales/en/kyc.json'
import enLeaderboard from './locales/en/leaderboard.json'
import hiCommon from './locales/hi/common.json'
import hiFeed from './locales/hi/feed.json'
import hiCreate from './locales/hi/create.json'
import hiCampaign from './locales/hi/campaign.json'
import hiProfile from './locales/hi/profile.json'
import hiWallet from './locales/hi/wallet.json'
import hiSupport from './locales/hi/support.json'
import hiKyc from './locales/hi/kyc.json'
import hiLeaderboard from './locales/hi/leaderboard.json'

type TelegramWindow = Window & {
  Telegram?: { WebApp?: { initDataUnsafe?: { user?: { language_code?: string } } } }
}

const hasBrowserGlobals = typeof window !== 'undefined'
const tgLang = hasBrowserGlobals
  ? (window as unknown as TelegramWindow).Telegram?.WebApp?.initDataUnsafe?.user?.language_code
  : undefined
const savedLang = hasBrowserGlobals ? window.localStorage.getItem('i18nextLng') : null

const SUPPORTED_LANGS = ['ru', 'en', 'hi'] as const
export function appLanguage(code: string | null | undefined): 'ru' | 'en' | 'hi' {
  const base = (code ?? '').toLowerCase().split(/[-_]/)[0] ?? ''
  if (!base) return 'ru'
  return (SUPPORTED_LANGS as readonly string[]).includes(base) ? (base as 'ru' | 'en' | 'hi') : 'en'
}

function syncHtmlLang(lng: string) {
  if (hasBrowserGlobals) document.documentElement.lang = lng
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      ru: { common: ruCommon, feed: ruFeed, create: ruCreate, campaign: ruCampaign, profile: ruProfile, wallet: ruWallet, support: ruSupport, kyc: ruKyc, leaderboard: ruLeaderboard },
      en: { common: enCommon, feed: enFeed, create: enCreate, campaign: enCampaign, profile: enProfile, wallet: enWallet, support: enSupport, kyc: enKyc, leaderboard: enLeaderboard },
      hi: { common: hiCommon, feed: hiFeed, create: hiCreate, campaign: hiCampaign, profile: hiProfile, wallet: hiWallet, support: hiSupport, kyc: hiKyc, leaderboard: hiLeaderboard },
    },
    lng: appLanguage(savedLang ?? tgLang),
    fallbackLng: 'en',
    supportedLngs: [...SUPPORTED_LANGS],
    defaultNS: 'common',
    ns: ['common', 'feed', 'create', 'campaign', 'profile', 'wallet', 'support', 'kyc', 'leaderboard'],
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'i18nextLng',
      caches: ['localStorage'],
    },
  })

i18n.on('languageChanged', syncHtmlLang)
syncHtmlLang(i18n.language)

export default i18n
