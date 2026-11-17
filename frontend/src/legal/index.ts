import termsRu from './terms.ru.md?raw'
import termsEn from './terms.en.md?raw'
import privacyRu from './privacy.ru.md?raw'
import privacyEn from './privacy.en.md?raw'

export type LegalDocKind = 'terms' | 'privacy'

const DOCS: Record<LegalDocKind, Record<'ru' | 'en', string>> = {
  terms: { ru: termsRu, en: termsEn },
  privacy: { ru: privacyRu, en: privacyEn },
}

export function isLegalDocKind(value: string | undefined): value is LegalDocKind {
  return value === 'terms' || value === 'privacy'
}

export function legalDocText(kind: LegalDocKind, language: string): string {
  return DOCS[kind][language.startsWith('ru') ? 'ru' : 'en']
}
