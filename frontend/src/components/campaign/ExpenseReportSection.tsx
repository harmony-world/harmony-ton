import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useExpenseReport } from '../../hooks/useApi'
import type { ExpenseReportStatus } from '../../api/expenseReports'
import { ExpenseReportUpload } from './ExpenseReportUpload'
import { PhotoViewer } from './PhotoViewer'
import { expenseReportPenaltyApplies } from '../../utils/expenseReportPenalty'

interface ExpenseReportSectionProps {
  campaignId: string
  isCreator: boolean
  isPublic: boolean
  channelId: string | null | undefined
  raisedAmountUsd: number
}

const STATUS_LABEL_KEYS: Record<ExpenseReportStatus, string> = {
  pending_review: 'expense.statusPending',
  approved: 'expense.statusApproved',
  rejected: 'expense.statusRejected',
  revision_requested: 'expense.statusRevision',
  missing: 'expense.statusMissing',
}

function statusColor(status: ExpenseReportStatus): string {
  switch (status) {
    case 'approved': return '#1F8A5B'
    case 'pending_review': return '#FF9500'
    case 'rejected': return '#FF3B30'
    case 'revision_requested': return '#FF9500'
    case 'missing': return '#8E8E93'
  }
}

function statusIcon(status: ExpenseReportStatus): string {
  switch (status) {
    case 'approved': return '✓'
    case 'pending_review': return '⏳'
    case 'rejected': return '✗'
    case 'revision_requested': return '✏️'
    case 'missing': return '—'
  }
}

export function ExpenseReportSection({ campaignId, isCreator, isPublic, channelId, raisedAmountUsd }: ExpenseReportSectionProps) {
  const { t } = useTranslation('campaign')
  const isPrivate = !isPublic
  const isChannel = channelId != null
  const penaltyApplies = expenseReportPenaltyApplies(raisedAmountUsd)
  const { data: report, isLoading, isError } = useExpenseReport(campaignId, !isPrivate)
  const [showUpload, setShowUpload] = useState(false)
  const [expandedOverride, setExpandedOverride] = useState<boolean | null>(null)
  const [photoViewerIndex, setPhotoViewerIndex] = useState<number | null>(null)

  const handlePhotoClick = useCallback((index: number) => {
    setPhotoViewerIndex(index)
  }, [])

  const handlePhotoViewerClose = useCallback(() => {
    setPhotoViewerIndex(null)
  }, [])

  if (isPrivate) return null
  if (isLoading) return null
  if (!report && !penaltyApplies) return null

  const canRevise = isCreator && report && (report.status === 'rejected' || report.status === 'revision_requested' || report.status === 'missing')
  const canUpload = isCreator && !report
  const isFirstUpload = !report?.photos?.length

  const viewablePhotos = report?.photos ?? []
  const hasViewableContent = viewablePhotos.length > 0

  if (showUpload) {
    return (
      <div className="rounded-[16px] p-4" style={{ background: 'var(--tg-theme-secondary-bg-color, #F7F7FA)' }}>
        <ExpenseReportUpload
          campaignId={campaignId}
          isRevision={!isFirstUpload}
          onSuccess={() => setShowUpload(false)}
          onCancel={() => setShowUpload(false)}
        />
      </div>
    )
  }

  if (report) {
    const expandable = hasViewableContent || canRevise || (isCreator && !!(report.moderationNote || report.ratingDelta !== 0))
    const expanded = expandedOverride ?? (!!canRevise && isFirstUpload)

    return (
      <div className="rounded-[16px] overflow-hidden" style={{ background: 'var(--tg-theme-secondary-bg-color, #F7F7FA)' }}>
        <button
          type="button"
          onClick={() => expandable && setExpandedOverride(!expanded)}
          className="w-full flex items-center justify-between p-4"
          style={{
            border: 'none',
            background: 'none',
            cursor: expandable ? 'pointer' : 'default',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          <div className="flex items-center gap-2.5">
            <h3 className="font-bold text-[16px]" style={{ color: 'var(--tg-theme-text-color, #1C1C1E)' }}>
              {t('expense.title')}
            </h3>
            {hasViewableContent && (
              <span className="text-[12px]" style={{ color: 'var(--tg-theme-hint-color, #8E8E93)' }}>
                {t('expense.documentsCount', { count: viewablePhotos.length })}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span
              className="text-[12px] font-semibold px-2 py-0.5 rounded-full"
              style={{ background: `${statusColor(report.status)}18`, color: statusColor(report.status) }}
            >
              {statusIcon(report.status)} {t(STATUS_LABEL_KEYS[report.status])}
            </span>
            {expandable && (
              <span
                className="text-[14px] transition-transform"
                style={{
                  color: 'var(--tg-theme-hint-color, #8E8E93)',
                  transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
                  display: 'inline-block',
                }}
              >
                ›
              </span>
            )}
          </div>
        </button>

        <div
          style={{
            maxHeight: expanded ? 600 : 0,
            overflow: 'hidden',
            transition: 'max-height 0.25s ease',
          }}
        >
          <div className="px-4 pb-4">
            {viewablePhotos.length > 0 && (
              <div className="flex gap-2 overflow-x-auto pb-2 mb-2">
                {viewablePhotos.map((url, i) => (
                  <button
                    key={url}
                    type="button"
                    onClick={() => handlePhotoClick(i)}
                    className="w-20 h-20 rounded-xl overflow-hidden shrink-0 focus:outline-none focus:ring-2 focus:ring-[var(--tg-theme-link-color,#007AFF)]"
                    style={{ border: 'none', padding: 0, cursor: 'pointer', background: 'none' }}
                  >
                    <img src={url} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}

            {report.comment && (
              <p className="text-[13px] leading-relaxed mb-2" style={{ color: 'var(--tg-theme-text-color, #3a3a3c)' }}>
                {report.comment}
              </p>
            )}

            {!report.comment && viewablePhotos.length > 0 && !isCreator && (
              <p className="text-[12px] mb-2" style={{ color: 'var(--tg-theme-hint-color, #8E8E93)' }}>
                {t('expense.tapToView')}
              </p>
            )}

            {isCreator && report.moderationNote && (
              <div
                className="rounded-xl px-3 py-2.5 mb-2 text-[13px]"
                style={{ background: '#FFF3CD', color: '#856404' }}
              >
                <span className="font-semibold">{t('expense.moderatorComment')}</span> {report.moderationNote}
              </div>
            )}

            {isCreator && report.ratingDelta !== 0 && (
              <div className="text-[12px] mb-2" style={{ color: report.ratingDelta > 0 ? '#1F8A5B' : '#FF3B30' }}>
                {t('expense.rating')}: {report.ratingDelta > 0 ? '+' : ''}{report.ratingDelta}
              </div>
            )}

            {canRevise && (
              <button
                onClick={(e) => { e.stopPropagation(); setShowUpload(true) }}
                className="w-full mt-1 font-semibold active:opacity-80 transition-opacity"
                style={{
                  height: 42,
                  borderRadius: 12,
                  background: 'var(--tg-brand-color)',
                  color: '#fff',
                  fontSize: 14,
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                {isFirstUpload ? t('expense.uploadBtn') : t('expense.reupload')}
              </button>
            )}
          </div>
        </div>

        {photoViewerIndex !== null && viewablePhotos.length > 0 && (
          <PhotoViewer
            photos={viewablePhotos}
            title={t('expense.title')}
            activeIndex={photoViewerIndex}
            onClose={handlePhotoViewerClose}
            onPrevious={() => setPhotoViewerIndex((i) => i !== null && i > 0 ? i - 1 : viewablePhotos.length - 1)}
            onNext={() => setPhotoViewerIndex((i) => i !== null ? (i + 1) % viewablePhotos.length : 0)}
          />
        )}
      </div>
    )
  }

  if (isError) return null

  if (canUpload) {
    return (
      <div className="rounded-[16px] p-4" style={{ background: 'var(--tg-theme-secondary-bg-color, #F7F7FA)' }}>
        <h3 className="font-bold text-[16px] mb-2" style={{ color: 'var(--tg-theme-text-color, #1C1C1E)' }}>
          {t('expense.title')}
        </h3>
        <p className="text-[13px] leading-relaxed mb-3" style={{ color: 'var(--tg-theme-hint-color, #8E8E93)' }}>
          {isChannel
            ? t('expense.channelHint')
            : penaltyApplies
              ? t('expense.personalHint')
              : t('expense.personalHintNoPenalty')}
        </p>
        <button
          onClick={() => setShowUpload(true)}
          className="w-full font-semibold active:opacity-80 transition-opacity"
          style={{
            height: 42,
            borderRadius: 12,
            background: 'var(--tg-brand-color)',
            color: '#fff',
            fontSize: 14,
            border: 'none',
            cursor: 'pointer',
          }}
        >
          {t('expense.uploadBtn')}
        </button>
      </div>
    )
  }

  if (!isCreator) {
    return (
      <div className="rounded-[16px] p-4" style={{ background: 'var(--tg-theme-secondary-bg-color, #F7F7FA)' }}>
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-[16px]" style={{ color: 'var(--tg-theme-text-color, #1C1C1E)' }}>
            {t('expense.title')}
          </h3>
          <span
            className="text-[12px] font-semibold px-2 py-0.5 rounded-full"
            style={{ background: '#8E8E9318', color: '#8E8E93' }}
          >
            — {t('expense.awaitingReport')}
          </span>
        </div>
      </div>
    )
  }

  return null
}
