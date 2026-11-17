import type { OrganizerType } from '../api/campaigns'
import type { CampaignCategory } from '../types'
import type { DraftPhoto } from '../types/createCampaign'

export interface CampaignWizardState {
  organizerType: OrganizerType
  channelLink: string
  channelAutopost: boolean
  orgName: string
  orgInn: string
  orgDoc: File | null
  title: string
  category: CampaignCategory | ''
  story: string
  photos: DraftPhoto[]
  photosIllustrative: boolean | null
  goalAmount: string
  deadline: string
  payoutAddress: string
  isPublic: boolean
}

export type CampaignDraftData = Pick<
  CampaignWizardState,
  | 'organizerType'
  | 'channelLink'
  | 'title'
  | 'category'
  | 'story'
  | 'photos'
  | 'photosIllustrative'
  | 'goalAmount'
  | 'deadline'
  | 'isPublic'
> & {
  step: number
  createdAt: string
}

export function isDraftPhoto(value: unknown): value is DraftPhoto {
  if (!value || typeof value !== 'object') return false
  const photo = value as Partial<Record<keyof DraftPhoto, unknown>>
  return (
    typeof photo.id === 'string' &&
    typeof photo.url === 'string' &&
    typeof photo.name === 'string' &&
    typeof photo.uploadedAt === 'string'
  )
}

export function getDraftPhotos(draft: Partial<CampaignDraftData>): DraftPhoto[] {
  return Array.isArray(draft.photos) ? draft.photos.filter(isDraftPhoto) : []
}

export function toCampaignDraftData(
  state: CampaignWizardState,
  step: number,
  createdAt: string,
): CampaignDraftData {
  return {
    organizerType: state.organizerType,
    channelLink: state.channelLink,
    title: state.title,
    category: state.category,
    story: state.story,
    photos: state.photos,
    photosIllustrative: state.photosIllustrative,
    goalAmount: state.goalAmount,
    deadline: state.deadline,
    isPublic: state.isPublic,
    step,
    createdAt,
  }
}

export function isDraftMeaningful(state: Partial<CampaignWizardState>): boolean {
  return !!(
    state.title ||
    state.story ||
    state.category ||
    (state.photos && state.photos.length > 0) ||
    state.goalAmount ||
    state.channelLink ||
    state.isPublic === false
  )
}
