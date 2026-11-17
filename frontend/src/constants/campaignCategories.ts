import i18n from '../i18n'

export const CAMPAIGN_CATEGORIES = [
  'project',
  'channel',
  'health',
  'education',
  'disaster',
  'housing',
  'family',
  'social',
  'animals',
  'birthday',
  'other',
] as const

export type CampaignCategory = (typeof CAMPAIGN_CATEGORIES)[number]

export const CAMPAIGN_CATEGORY_KEYS: { value: CampaignCategory; labelKey: string }[] = [
  { value: 'project', labelKey: 'categories.project' },
  { value: 'channel', labelKey: 'categories.channel' },
  { value: 'health', labelKey: 'categories.health' },
  { value: 'education', labelKey: 'categories.education' },
  { value: 'disaster', labelKey: 'categories.disaster' },
  { value: 'housing', labelKey: 'categories.housing' },
  { value: 'family', labelKey: 'categories.family' },
  { value: 'social', labelKey: 'categories.social' },
  { value: 'animals', labelKey: 'categories.animals' },
  { value: 'birthday', labelKey: 'categories.birthday' },
  { value: 'other', labelKey: 'categories.other' },
]

export function getCampaignCategoryLabel(category: CampaignCategory | string): string {
  return i18n.t(`categories.${category}`) || category
}

export const CAMPAIGN_CATEGORY_OPTIONS = CAMPAIGN_CATEGORY_KEYS

export function getCategoryOptionsForOrganizer(organizerType: string) {
  return CAMPAIGN_CATEGORY_KEYS.filter((c) => {
    if (organizerType === 'personal' && c.value === 'channel') return false
    if (organizerType === 'telegram_channel' && c.value === 'birthday') return false
    return true
  })
}
