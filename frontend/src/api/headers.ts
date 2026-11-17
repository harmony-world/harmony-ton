import i18n from '../i18n'

export function getLanguageHeader(): Record<string, string> {
  return { 'x-harmony-language': i18n.language || 'en' }
}
