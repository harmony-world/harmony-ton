import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { CampaignCategory } from '../../types'
import { getCategoryOptionsForOrganizer } from '../../constants/campaignCategories'
import {
  ACCEPT_ATTR,
  deleteUploadedImages,
  isAcceptedImage,
  MAX_SOURCE_BYTES,
  uploadImage,
} from '../../api/uploads'
import type { DraftPhoto } from '../../types/createCampaign'
import { ImageCropper } from './ImageCropper'
import { PhotoThumb } from './PhotoThumb'
import { CAMPAIGN_STORY_MAX_LENGTH } from '../../utils/createCampaignWizard'

interface DetailsState {
  title: string
  category: CampaignCategory | ''
  story: string
  photos: DraftPhoto[]
  photosIllustrative: boolean | null
}

interface Props {
  state: DetailsState
  organizerType: string
  isPublic: boolean
  onIsPublicChange: (v: boolean) => void
  onChange: (patch: Partial<DetailsState>) => void
  errors: Partial<Record<keyof DetailsState, string>>
  onCroppingChange?: (isCropping: boolean) => void
}

function makeDraftPhotoId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function StepDetails({ state, organizerType, isPublic, onIsPublicChange, onChange, errors, onCroppingChange }: Props) {
  const { t } = useTranslation()
  const categoryOptions = getCategoryOptionsForOrganizer(organizerType)
  const isBirthday = state.category === 'birthday'
  const fileRef = useRef<HTMLInputElement>(null)
  const photoSectionRef = useRef<HTMLDivElement>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [cropSource, setCropSource] = useState<{ objectUrl: string; file: File; pendingFiles: File[] } | null>(null)

  useEffect(() => {
    onCroppingChange?.(cropSource !== null)
    if (cropSource) {
      requestAnimationFrame(() => {
        photoSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      })
    }
  }, [cropSource, onCroppingChange])

  async function handleFiles(files: FileList | null) {
    if (!files) return
    setUploadError(null)
    const remainingSlots = 5 - state.photos.length
    if (remainingSlots <= 0) return

    const chosen = Array.from(files)
    const typed = chosen.filter(isAcceptedImage)
    const valid = typed.filter((f) => f.size <= MAX_SOURCE_BYTES).slice(0, remainingSlots)

    if (valid.length === 0) {
      setUploadError(
        typed.length > 0 ? t('create:details.uploadTooLargeError') : t('create:details.uploadError'),
      )
      return
    }

    if (valid.length < files.length) {
      setUploadError(t('create:details.partialUploadError'))
    }

    const first = valid[0]!
    setCropSource({
      objectUrl: URL.createObjectURL(first),
      file: first,
      pendingFiles: valid.slice(1),
    })
  }

  async function uploadFiles(valid: File[]) {
    try {
      setIsUploading(true)
      const results = await Promise.allSettled(
        valid.map(async (file) => ({
          id: makeDraftPhotoId(),
          url: await uploadImage(file),
          name: file.name,
          uploadedAt: new Date().toISOString(),
        })),
      )
      const uploaded = results.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []))
      const failed = results.length - uploaded.length

      if (failed > 0) {
        if (uploaded.length > 0) {
          onChange({ photos: [...state.photos, ...uploaded].slice(0, 5) })
        }
        setUploadError(
          uploaded.length > 0
            ? t('create:details.partialUploadSuccess')
            : t('create:details.uploadFailed'),
        )
        return
      }

      onChange({ photos: [...state.photos, ...uploaded].slice(0, 5) })
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : t('create:details.uploadFailed'))
    } finally {
      setIsUploading(false)
    }
  }

  async function handleCropDone(blob: Blob) {
    if (!cropSource) return
    URL.revokeObjectURL(cropSource.objectUrl)
    const pending = cropSource.pendingFiles

    const croppedFile = new File([blob], cropSource.file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' })
    await uploadFiles([croppedFile])

    if (pending.length > 0) {
      const next = pending[0]!
      setCropSource({
        objectUrl: URL.createObjectURL(next),
        file: next,
        pendingFiles: pending.slice(1),
      })
    } else {
      setCropSource(null)
    }
  }

  function handleCropCancel() {
    if (!cropSource) return
    URL.revokeObjectURL(cropSource.objectUrl)
    const pending = cropSource.pendingFiles

    if (pending.length > 0) {
      const next = pending[0]!
      setCropSource({
        objectUrl: URL.createObjectURL(next),
        file: next,
        pendingFiles: pending.slice(1),
      })
    } else {
      setCropSource(null)
    }
  }

  function removePhoto(i: number) {
    const removed = state.photos[i]
    onChange({ photos: state.photos.filter((_, idx) => idx !== i) })
    if (removed) void deleteUploadedImages([removed.url])
  }

  function makeMainPhoto(i: number) {
    if (i === 0) return
    const next = [...state.photos]
    const [selected] = next.splice(i, 1)
    if (selected) {
      onChange({ photos: [selected, ...next] })
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    handleFiles(e.dataTransfer.files)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-[var(--tg-theme-text-color,#1C1C1E)]">{t('create:details.titleLabel')}</label>
          <span className="text-xs text-[var(--tg-theme-hint-color,#8E8E93)]">{state.title.length}/100</span>
        </div>
        <input
          type="text"
          value={state.title}
          onChange={(e) => onChange({ title: e.target.value })}
          maxLength={100}
          placeholder={t('create:details.titlePlaceholder')}
          className="input-base"
        />
        {errors.title && <p className="text-xs text-red-500">{errors.title}</p>}
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-[var(--tg-theme-text-color,#1C1C1E)]">{t('create:details.categoryLabel')}</label>
        <div className="grid grid-cols-2 gap-2">
          {categoryOptions.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => onChange({ category: c.value })}
              className="py-2.5 px-3 rounded-full text-sm font-medium transition-colors"
              style={{
                background: state.category === c.value
                  ? 'rgba(var(--tg-brand-color-rgb),.1)'
                  : 'var(--tg-theme-secondary-bg-color, #F2F2F7)',
                color: state.category === c.value
                  ? 'var(--tg-brand-color)'
                  : 'var(--tg-theme-text-color, #1C1C1E)',
                border: state.category === c.value
                  ? '1px solid var(--tg-brand-color)'
                  : '1px solid color-mix(in srgb, var(--tg-theme-hint-color, #8E8E93) 12%, transparent)',
              }}
            >
              {t(c.labelKey)}
            </button>
          ))}
        </div>
        {errors.category && <p className="text-xs text-red-500">{errors.category}</p>}
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-[var(--tg-theme-text-color,#1C1C1E)]">{t('create:details.storyLabel')}</label>
          <span className="text-xs text-[var(--tg-theme-hint-color,#8E8E93)]">{state.story.length}/{CAMPAIGN_STORY_MAX_LENGTH}</span>
        </div>
        <textarea
          value={state.story}
          onChange={(e) => onChange({ story: e.target.value })}
          maxLength={CAMPAIGN_STORY_MAX_LENGTH}
          rows={6}
          placeholder={t('create:details.storyPlaceholder')}
          className="input-base resize-none"
        />
        {errors.story && <p className="text-xs text-red-500">{errors.story}</p>}
      </div>

      <div ref={photoSectionRef} className="flex flex-col gap-2">
        <label className="text-sm font-medium text-[var(--tg-theme-text-color,#1C1C1E)]">
          {t('create:details.photosLabel')}{' '}
          <span className="text-[var(--tg-theme-hint-color,#8E8E93)] font-normal">({state.photos.length}/5)</span>
        </label>
        {cropSource && (
          <ImageCropper
            src={cropSource.objectUrl}
            onCrop={(blob) => void handleCropDone(blob)}
            onCancel={handleCropCancel}
          />
        )}
        {!cropSource && state.photos.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            {state.photos.map((photo, i) => (
              <PhotoThumb
                key={photo.id}
                photo={photo}
                index={i}
                isMain={i === 0}
                onMakeMain={() => makeMainPhoto(i)}
                onRemove={() => removePhoto(i)}
              />
            ))}
            {state.photos.length < 5 && (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={isUploading}
                className="w-24 h-24 rounded-xl border border-dashed flex items-center justify-center shrink-0 active:opacity-70 transition-opacity disabled:opacity-50"
                style={{ borderColor: 'color-mix(in srgb, var(--tg-theme-hint-color, #8E8E93) 25%, transparent)' }}
              >
                {isUploading ? (
                  <span className="text-xs text-[var(--tg-theme-hint-color,#8E8E93)]">...</span>
                ) : (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <path d="M12 5v14M5 12h14" stroke="var(--tg-theme-hint-color, #8E8E93)" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                )}
              </button>
            )}
          </div>
        )}
        {!cropSource && state.photos.length === 0 && (
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => fileRef.current?.click()}
            className={`border border-dashed rounded-[14px] p-6 flex flex-col items-center gap-2 text-[var(--tg-theme-hint-color,#8E8E93)] active:opacity-70 transition-opacity cursor-pointer ${
              isUploading ? 'opacity-60 pointer-events-none' : ''
            }`}
            style={{ borderColor: 'color-mix(in srgb, var(--tg-theme-hint-color, #8E8E93) 25%, transparent)' }}
          >
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <rect x="2" y="6" width="24" height="18" rx="3" stroke="currentColor" strokeWidth="1.5" />
              <circle cx="9" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.5" />
              <path d="M2 20l7-5 5 4 4-3 8 4" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
            </svg>
            <p className="text-sm text-center">
              {isUploading ? t('create:details.uploadingPhotos') : (
                <>
                  {t('create:details.dropOrSelect').split('<1>')[0]}<span className="text-[var(--tg-brand-color)]">{t('create:details.dropOrSelect').split('<1>')[1]?.split('</1>')[0]}</span>
                </>
              )}
            </p>
            <p className="text-xs">{t('create:details.photoFormats')}</p>
          </div>
        )}
        {uploadError && <p className="text-xs text-red-500">{uploadError}</p>}
        {!uploadError && errors.photos && <p className="text-xs text-red-500">{errors.photos}</p>}
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPT_ATTR}
          multiple
          className="hidden"
          onChange={(e) => {
            void handleFiles(e.target.files)
            e.target.value = ''
          }}
        />
      </div>

      {state.photos.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-[var(--tg-theme-text-color,#1C1C1E)]">
            {t('create:details.photosOriginLabel')}
          </p>
          <div className="flex flex-col gap-2">
            {[
              { value: false, label: t('create:details.photosOriginOwn') },
              { value: true, label: t('create:details.photosOriginIllustrative') },
            ].map((option) => (
              <label
                key={String(option.value)}
                className="flex items-start gap-3 rounded-[14px] p-3.5 cursor-pointer transition-colors"
                style={{
                  background: 'var(--tg-theme-secondary-bg-color, #fff)',
                  outline:
                    state.photosIllustrative === option.value
                      ? '2px solid var(--tg-brand-color)'
                      : '1px solid color-mix(in srgb, var(--tg-theme-hint-color, #8E8E93) 20%, transparent)',
                }}
              >
                <input
                  type="radio"
                  name="photos-origin"
                  className="mt-0.5 accent-[var(--tg-brand-color)]"
                  checked={state.photosIllustrative === option.value}
                  onChange={() => onChange({ photosIllustrative: option.value })}
                />
                <span className="text-sm text-[var(--tg-theme-text-color,#1C1C1E)]">{option.label}</span>
              </label>
            ))}
          </div>
          <p className="text-xs text-[var(--tg-theme-hint-color,#8E8E93)]">
            {t('create:details.photosOriginHint')}
          </p>
          {errors.photosIllustrative && <p className="text-xs text-red-500">{errors.photosIllustrative}</p>}
        </div>
      )}

      <div>
        <p className="text-sm font-medium text-[var(--tg-theme-text-color,#1C1C1E)] mb-2">{t('create:details.visibilityLabel')}</p>
        <label
          className={`relative flex items-center gap-3 rounded-[14px] p-3.5 transition-colors ${isBirthday ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
          style={{
            background: 'var(--tg-theme-secondary-bg-color, #fff)',
            border: '1px solid color-mix(in srgb, var(--tg-theme-hint-color, #8E8E93) 12%, transparent)',
          }}
        >
          <input
            type="checkbox"
            checked={!isPublic}
            onChange={(e) => { if (!isBirthday) onIsPublicChange(!e.target.checked) }}
            disabled={isBirthday}
            className="sr-only peer"
          />
          <span
            aria-hidden="true"
            className="relative h-7 w-12 shrink-0 rounded-full bg-[var(--tg-theme-hint-color,#8E8E93)]/35 transition-colors peer-checked:bg-[var(--tg-brand-color)] peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--tg-brand-color)] peer-focus-visible:ring-offset-2"
          >
            <span className={`absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${isPublic ? '' : 'translate-x-5'}`} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-[var(--tg-theme-text-color,#1C1C1E)]">
              {t('create:details.privateToggle')}
            </span>
            <span className="mt-0.5 block text-xs leading-relaxed text-[var(--tg-theme-hint-color,#8E8E93)]">
              {isBirthday ? t('create:details.birthdayPrivateNote') : t('create:details.privateDescription')}
            </span>
          </span>
        </label>
      </div>
    </div>
  )
}
