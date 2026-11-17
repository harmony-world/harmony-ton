import { Address } from '@ton/core'
import { deleteUploadedImages } from '../api/uploads'
import { getUserStorageKey } from './sessionIsolation'
import { IS_TESTNET } from './env'
import type { DraftPhoto } from '../types/createCampaign'
import {
  getDraftPhotos,
  toCampaignDraftData,
  type CampaignDraftData,
  type CampaignWizardState,
} from './campaignDraft'

export type WizardState = CampaignWizardState

export type StepErrors = Partial<Record<string, string>>
type Translate = (key: string, options?: Record<string, unknown>) => string

export const CAMPAIGN_GOAL_MIN_USD = 10

export const CAMPAIGN_TITLE_MIN_LENGTH = 10
export const CAMPAIGN_TITLE_MAX_LENGTH = 100

export const CAMPAIGN_GOAL_MAX_USD_FALLBACK = 1000

export const CAMPAIGN_STORY_MIN_LENGTH = 100
export const CAMPAIGN_STORY_MAX_LENGTH = 500

export const WIZARD_STEP_COUNT = 4

export function normalizeDraftStep(value: unknown): number {
  const step = Number(value)
  if (!Number.isInteger(step)) return 0
  return Math.min(Math.max(step, 0), WIZARD_STEP_COUNT - 1)
}

export function getDraftEditStep(restoredStep: number): number {
  const step = normalizeDraftStep(restoredStep)
  if (step >= WIZARD_STEP_COUNT - 1) return WIZARD_STEP_COUNT - 2
  return step
}

const fallbackT: Translate = (key, options) => {
  const values: Record<string, string> = {
    'create:validation.channelRequired': 'Enter a channel link',
    'create:validation.channelActive': 'This channel already has an active campaign. Wait until it finishes.',
    'create:validation.channelVerify': 'Press Verify and wait for successful verification',
    'create:validation.organizationUnavailable': 'Organizations and NGOs will become available later',
    'create:validation.orgNameRequired': 'Enter organization name',
    'create:validation.orgInnRequired': 'Enter tax ID',
    'create:validation.titleMin': 'Minimum 10 characters',
    'create:validation.titleMax': 'Maximum 100 characters',
    'create:validation.categoryRequired': 'Choose a category',
    'create:validation.storyMin': `Minimum ${CAMPAIGN_STORY_MIN_LENGTH} characters (now ${String(options?.count ?? 0)})`,
    'create:validation.storyMax': `Maximum ${CAMPAIGN_STORY_MAX_LENGTH} characters`,
    'create:validation.photosRequired': 'Add at least one photo',
    'create:validation.photosOriginRequired': 'Tell us where the photos come from',
    'create:validation.goalMin': `Minimum $${String(CAMPAIGN_GOAL_MIN_USD)}`,
    'create:validation.goalMax': `Maximum $${String(options?.max ?? CAMPAIGN_GOAL_MAX_USD_FALLBACK)}`,
    'create:validation.deadlineRequired': 'Choose a date',
    'create:validation.payoutRequired': 'Enter GRAM address',
    'create:validation.payoutInvalid': 'Invalid GRAM address',
    'create:validation.payoutWrongNetwork': 'This address belongs to a different TON network',
  }
  return values[key] ?? key
}

export function validateStep(
  step: number,
  state: WizardState,
  extra?: {
    channelVerified?: boolean
    channelHasActiveCampaign?: boolean
    goalMaxUsd?: number
  },
  translate?: Translate,
): StepErrors {
  const t = translate ?? fallbackT
  const errors: StepErrors = {}
  if (step === 0) {
    if (state.organizerType === 'telegram_channel') {
      if (!state.channelLink.trim()) {
        errors.channelLink = t('create:validation.channelRequired')
      } else if (extra?.channelHasActiveCampaign) {
        errors.channelLink = t('create:validation.channelActive')
      } else if (!extra?.channelVerified) {
        errors.channelLink = t('create:validation.channelVerify')
      }
    }
    if (state.organizerType === 'organization') {
      errors.organizerType = t('create:validation.organizationUnavailable')
      if (!state.orgName.trim()) errors.orgName = t('create:validation.orgNameRequired')
      if (!state.orgInn.trim()) errors.orgInn = t('create:validation.orgInnRequired')
    }
  }
  if (step === 1) {
    if (state.title.length < CAMPAIGN_TITLE_MIN_LENGTH) errors.title = t('create:validation.titleMin')
    if (state.title.length > CAMPAIGN_TITLE_MAX_LENGTH) errors.title = t('create:validation.titleMax')
    if (!state.category) errors.category = t('create:validation.categoryRequired')
    if (state.story.length < CAMPAIGN_STORY_MIN_LENGTH)
      errors.story = t('create:validation.storyMin', { count: state.story.length })
    if (state.story.length > CAMPAIGN_STORY_MAX_LENGTH) errors.story = t('create:validation.storyMax')
    if (state.photos.length === 0) errors.photos = t('create:validation.photosRequired')
    else if (state.photosIllustrative === null)
      errors.photosIllustrative = t('create:validation.photosOriginRequired')
  }
  if (step === 2) {
    const goal = Number(state.goalAmount)
    const goalMax = extra?.goalMaxUsd ?? CAMPAIGN_GOAL_MAX_USD_FALLBACK
    if (!state.goalAmount || isNaN(goal) || goal < CAMPAIGN_GOAL_MIN_USD)
      errors.goalAmount = t('create:validation.goalMin')
    if (goal > goalMax) errors.goalAmount = t('create:validation.goalMax', { max: goalMax.toLocaleString() })
    if (!state.deadline) errors.deadline = t('create:validation.deadlineRequired')
    if (!state.payoutAddress.trim()) errors.payoutAddress = t('create:validation.payoutRequired')
    else {
      try {
        if (Address.isFriendly(state.payoutAddress)) {
          if (Address.parseFriendly(state.payoutAddress).isTestOnly !== IS_TESTNET)
            errors.payoutAddress = t('create:validation.payoutWrongNetwork')
        } else {
          Address.parse(state.payoutAddress)
        }
      }
      catch { errors.payoutAddress = t('create:validation.payoutInvalid') }
    }
  }
  return errors
}

export const INITIAL: WizardState = {
  organizerType: 'telegram_channel',
  channelLink: '',
  channelAutopost: true,
  orgName: '',
  orgInn: '',
  orgDoc: null,
  title: '',
  category: '',
  story: '',
  photos: [],
  photosIllustrative: null,
  goalAmount: '',
  deadline: '',
  payoutAddress: '',
  isPublic: true,
}

const DRAFT_KEY_BASE = 'harmony_campaign_draft'
const DRAFT_TTL_MS = 30 * 60 * 1000

function getDraftKey() {
  return getUserStorageKey(DRAFT_KEY_BASE)
}

function cleanupDraftPhotos(photos: DraftPhoto[]) {
  void deleteUploadedImages(photos.map((photo) => photo.url))
}

export function loadDraft(): { state: Partial<WizardState>; step: number; createdAt: string } | null {
  try {
    const raw = localStorage.getItem(getDraftKey())
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<CampaignDraftData>
    const createdAt = typeof parsed.createdAt === 'string' ? parsed.createdAt : new Date().toISOString()
    if (Date.now() - Date.parse(createdAt) > DRAFT_TTL_MS) {
      cleanupDraftPhotos(getDraftPhotos(parsed))
      localStorage.removeItem(getDraftKey())
      return null
    }

    const { step = 0, ...rest } = parsed
    const state = { ...rest, photos: getDraftPhotos(parsed) }
    delete (state as Partial<CampaignDraftData>).createdAt
    return { state, step: normalizeDraftStep(step), createdAt }
  } catch {
    return null
  }
}

export function saveDraft(state: WizardState, step: number, createdAt: string) {
  try {
    localStorage.setItem(getDraftKey(), JSON.stringify(toCampaignDraftData(state, step, createdAt)))
  } catch {  }
}

export function clearDraft(photosToDelete: DraftPhoto[] = []) {
  cleanupDraftPhotos(photosToDelete)
  localStorage.removeItem(getDraftKey())
}
