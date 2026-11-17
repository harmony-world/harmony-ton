import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { ACCEPT_ATTR, uploadImage } from '../api/uploads'
import { sendFeedback } from '../api/support'

const MAX_PHOTOS = 3

type TgWindow = Window & { Telegram?: { WebApp?: { showAlert?: (msg: string) => void } } }
const showAlert = (msg: string) => {
  const fn = (window as TgWindow).Telegram?.WebApp?.showAlert
  if (fn) {
    fn(msg)
  } else {
    alert(msg)
  }
}

export function SupportPage() {
  const { t } = useTranslation('support')
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)

  const [message, setMessage] = useState('')
  const [photos, setPhotos] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const [sending, setSending] = useState(false)

  const canSend = message.trim().length >= 5 && !sending && !uploading

  async function handleAddPhoto() {
    fileRef.current?.click()
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    if (photos.length >= MAX_PHOTOS) {
      showAlert(t('maxPhotos', { count: MAX_PHOTOS }))
      return
    }

    setUploading(true)
    try {
      const url = await uploadImage(file)
      setPhotos((prev) => [...prev, url])
    } catch (err) {
      showAlert((err as Error).message || t('uploadError'))
    } finally {
      setUploading(false)
    }
  }

  function handleRemovePhoto(index: number) {
    setPhotos((prev) => prev.filter((_, i) => i !== index))
  }

  async function handleSubmit() {
    if (!canSend) return
    setSending(true)
    try {
      await sendFeedback(message.trim(), photos)
      showAlert(t('sent'))
      navigate('/profile/settings', { replace: true })
    } catch (err) {
      showAlert((err as Error).message || t('sendError'))
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--tg-theme-secondary-bg-color,#F2F2F7)]">
      <header className="flex h-11 items-center gap-2 px-4">
        <Link
          to="/profile/settings"
          className="flex items-center gap-1 text-[14px] font-medium"
          style={{ color: 'var(--tg-theme-link-color,var(--tg-brand-color))' }}
        >
          <svg width="8" height="14" viewBox="0 0 8 14" fill="none">
            <path d="M7 1L1 7l6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {t('back')}
        </Link>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto px-4 pb-8">
        <h1 className="mb-4 text-[20px] font-bold text-[var(--tg-theme-text-color,#1C1C1E)]">
          {t('title')}
        </h1>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-[var(--tg-theme-text-color,#1C1C1E)]">
              {t('descriptionLabel')}
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={t('descriptionPlaceholder')}
              rows={5}
              className="input-base resize-none"
              maxLength={2000}
            />
            <p className="text-[12px] text-[var(--tg-theme-hint-color,#8E8E93)]">
              {t('minChars')}
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-[var(--tg-theme-text-color,#1C1C1E)]">
              {t('screenshots')} <span className="font-normal text-[var(--tg-theme-hint-color,#8E8E93)]">{t('screenshotsLimit', { count: MAX_PHOTOS })}</span>
            </label>

            {photos.length > 0 && (
              <div className="flex gap-2 overflow-x-auto">
                {photos.map((url, i) => (
                  <div key={url} className="relative shrink-0">
                    <img
                      src={url}
                      alt={t('screenshotAlt', { index: i + 1 })}
                      className="h-20 w-20 rounded-lg object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemovePhoto(i)}
                      className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--tg-theme-destructive-text-color,#D0021B)] text-white text-[11px] font-bold"
                    >
                      &times;
                    </button>
                  </div>
                ))}
              </div>
            )}

            {photos.length < MAX_PHOTOS && (
              <button
                type="button"
                onClick={handleAddPhoto}
                disabled={uploading}
                className="flex h-10 items-center justify-center gap-1.5 rounded-[12px] text-[14px] font-medium"
                style={{
                  color: 'var(--tg-theme-link-color,var(--tg-brand-color))',
                  background: 'rgba(var(--tg-brand-color-rgb),.08)',
                }}
              >
                {uploading ? (
                  t('loading')
                ) : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="3" />
                      <circle cx="8.5" cy="8.5" r="1.5" />
                      <path d="M21 15l-5-5-11 11" />
                    </svg>
                    {t('addScreenshot')}
                  </>
                )}
              </button>
            )}

            <input
              ref={fileRef}
              type="file"
              accept={ACCEPT_ATTR}
              onChange={handleFileChange}
              className="hidden"
            />
          </div>

          <div className="rounded-[14px] bg-[var(--tg-theme-bg-color,#fff)] p-3.5">
            <p className="text-[12px] leading-relaxed text-[var(--tg-theme-hint-color,#8E8E93)]">
              {t('replyHint')}
            </p>
          </div>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSend}
            className="flex h-[50px] items-center justify-center rounded-[14px] text-[16px] font-semibold text-white transition-opacity disabled:opacity-40"
            style={{ background: 'var(--tg-theme-button-color,var(--tg-brand-color))' }}
          >
            {sending ? t('sending') : t('send')}
          </button>
        </div>
      </main>
    </div>
  )
}
