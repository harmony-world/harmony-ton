import { useTranslation } from 'react-i18next'
import type { DraftPhoto } from '../../types/createCampaign'

interface PhotoThumbProps {
  photo: DraftPhoto
  index: number
  isMain: boolean
  onMakeMain: () => void
  onRemove: () => void
}

export function PhotoThumb({ photo, index, isMain, onMakeMain, onRemove }: PhotoThumbProps) {
  const { t } = useTranslation('create')
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={onMakeMain}
        aria-label={isMain ? t('details.mainPhoto') : t('details.makeMainPhotoAria', { index: index + 1 })}
        className={`block w-24 h-24 rounded-xl overflow-hidden border-2 active:opacity-80 transition-opacity ${
          isMain ? 'border-[var(--tg-brand-color)]' : 'border-transparent'
        }`}
      >
        <img
          src={photo.url}
          alt=""
          className="w-full h-full object-cover"
        />
      </button>
      <div
        className="absolute left-1.5 bottom-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold"
        style={{
          background: isMain ? 'var(--tg-brand-color)' : 'rgba(20,24,32,.62)',
          color: '#fff',
        }}
      >
        {isMain ? t('details.mainPhotoBadge') : `${index + 1}`}
      </div>
      {!isMain && (
        <button
          type="button"
          onClick={onMakeMain}
          className="absolute left-1.5 top-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold active:opacity-75"
          style={{ background: 'rgba(255,255,255,.92)', color: 'var(--tg-brand-color)' }}
        >
          {t('details.makeMainPhoto')}
        </button>
      )}
      <button
        type="button"
        onClick={onRemove}
        aria-label={t('details.removePhotoAria', { index: index + 1 })}
        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-[#FF3B30] flex items-center justify-center"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M2 2l6 6M8 2L2 8" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  )
}
