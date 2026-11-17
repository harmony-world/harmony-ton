import { useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { ACCEPT_ATTR, uploadImage } from '../../api/uploads'
import { useSubmitExpenseReport } from '../../hooks/useApi'

interface ExpenseReportUploadProps {
  campaignId: string
  isRevision?: boolean
  onSuccess: () => void
  onCancel: () => void
}

export function ExpenseReportUpload({ campaignId, isRevision, onSuccess, onCancel }: ExpenseReportUploadProps) {
  const { t } = useTranslation('campaign')
  const [photos, setPhotos] = useState<string[]>([])
  const [comment, setComment] = useState('')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const submitMutation = useSubmitExpenseReport(campaignId)

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    setError(null)
    setUploading(true)
    try {
      const newPhotos: string[] = []
      for (const file of Array.from(files)) {
        if (photos.length + newPhotos.length >= 5) break
        const url = await uploadImage(file)
        newPhotos.push(url)
      }
      setPhotos((prev) => [...prev, ...newPhotos].slice(0, 5))
    } catch (err) {
      setError(err instanceof Error ? err.message : t('expense.uploadPhotoError'))
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const removePhoto = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index))
  }

  const handleSubmit = async () => {
    if (photos.length === 0) return
    setError(null)
    try {
      await submitMutation.mutateAsync({ photos, comment: comment.trim() || undefined })
      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('expense.submitError'))
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-[16px]" style={{ color: 'var(--tg-theme-text-color, #1C1C1E)' }}>
          {isRevision ? t('expense.revisionTitle') : t('expense.uploadTitle')}
        </h3>
        <button
          onClick={onCancel}
          className="text-[14px] font-medium active:opacity-70"
          style={{ color: 'var(--tg-theme-hint-color, #8E8E93)', background: 'none', border: 'none', cursor: 'pointer' }}
        >
          {t('expense.cancel')}
        </button>
      </div>

      <p className="text-[13px] leading-relaxed" style={{ color: 'var(--tg-theme-hint-color, #8E8E93)' }}>
        {t('expense.uploadInstructions')}
      </p>

      <div className="flex flex-wrap gap-2">
        {photos.map((url, i) => (
          <div key={url} className="relative w-20 h-20 rounded-xl overflow-hidden">
            <img src={url} alt="" className="w-full h-full object-cover" />
            <button
              type="button"
              onClick={() => removePhoto(i)}
              className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-[#FF3B30] flex items-center justify-center"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M2 2l6 6M8 2L2 8" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        ))}
        {photos.length < 5 && (
          <label
            className="w-20 h-20 rounded-xl flex flex-col items-center justify-center cursor-pointer active:opacity-70"
            style={{ border: '2px dashed var(--tg-theme-hint-color, #C7C7CC)', background: 'var(--tg-theme-secondary-bg-color, #F2F2F7)' }}
          >
            <span className="text-[22px]" style={{ color: 'var(--tg-theme-hint-color, #8E8E93)' }}>+</span>
            <span className="text-[10px] font-medium" style={{ color: 'var(--tg-theme-hint-color, #8E8E93)' }}>
              {uploading ? '...' : t('expense.photoLabel')}
            </span>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPT_ATTR}
              multiple
              onChange={(e) => void handleFileSelect(e)}
              className="hidden"
              disabled={uploading}
            />
          </label>
        )}
      </div>

      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder={t('expense.commentPlaceholder')}
        maxLength={2000}
        rows={3}
        className="w-full rounded-xl px-3 py-2.5 text-[14px] resize-none"
        style={{
          background: 'var(--tg-theme-secondary-bg-color, #F2F2F7)',
          color: 'var(--tg-theme-text-color, #1C1C1E)',
          border: '1px solid var(--tg-theme-secondary-bg-color, #E5E5EA)',
          outline: 'none',
        }}
      />

      {error && (
        <div className="text-[13px] font-medium" style={{ color: '#FF3B30' }}>{error}</div>
      )}

      <button
        onClick={() => void handleSubmit()}
        disabled={photos.length === 0 || submitMutation.isPending || uploading}
        className="w-full text-white font-semibold active:opacity-80 transition-opacity disabled:opacity-50"
        style={{
          height: 48,
          borderRadius: 14,
          background: 'var(--tg-brand-color)',
          fontSize: 16,
          border: 'none',
          cursor: photos.length === 0 || submitMutation.isPending ? 'default' : 'pointer',
        }}
      >
        {submitMutation.isPending ? t('expense.submitting') : t('expense.submitBtn')}
      </button>
    </div>
  )
}
