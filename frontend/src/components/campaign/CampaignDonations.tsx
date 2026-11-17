import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import type { DonationItem } from '../../api/donations'
import { formatDonationDateTime } from '../../utils/format'
import { donationDonorLabel } from '../../utils/donations'

interface CampaignDonationsProps {
  donations: DonationItem[]
}

export function CampaignDonations({ donations }: CampaignDonationsProps) {
  const { t, i18n } = useTranslation('campaign')
  const navigate = useNavigate()

  return (
    <>
        <section>
          <h2 className="font-bold mb-3" style={{ fontSize: 17, color: 'var(--tg-theme-text-color, #1C1C1E)' }}>{t('donations.title')}</h2>
          {donations.length === 0 ? (
            <div
              className="rounded-[16px] px-4 py-4 text-[14px]"
              style={{ background: 'var(--tg-theme-secondary-bg-color, #F7F7FA)', color: 'var(--tg-theme-hint-color, #8E8E93)' }}
            >
              {t('donations.empty')}
            </div>
          ) : (
            <div className="flex flex-col gap-0.5">
              {donations.map((d, index) => {
                const name = donationDonorLabel(d, t('anonymous'))
                const letter = d.isAnonymous ? '·' : name[0]?.toUpperCase() ?? '·'
                const canNavigate = !d.isAnonymous && d.donorUserId

                const handleDonorClick = () => {
                  if (canNavigate) navigate(`/profile/${d.donorUserId}`)
                }

                const avatarNode = d.donorPhotoUrl && !d.isAnonymous ? (
                  <img
                    src={d.donorPhotoUrl}
                    alt=""
                    className="shrink-0 rounded-full object-cover"
                    style={{ width: 36, height: 36 }}
                    loading="lazy"
                  />
                ) : (
                  <span
                    className="shrink-0 flex items-center justify-center font-semibold text-[13px]"
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: '50%',
                      background: d.isAnonymous ? 'var(--tg-theme-secondary-bg-color, #EEF1F6)' : 'rgba(var(--tg-brand-color-rgb),.12)',
                      color: d.isAnonymous ? 'var(--tg-theme-hint-color, #5a5a5e)' : 'var(--tg-brand-color)',
                    }}
                  >
                    {letter}
                  </span>
                )

                const donorNameNode = canNavigate ? (
                  <button
                    type="button"
                    onClick={handleDonorClick}
                    className="min-w-0 text-left font-semibold text-[14.5px] outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-[var(--tg-brand-color)] active:opacity-70"
                    style={{ color: 'var(--tg-brand-color)', background: 'transparent', border: 'none', padding: 0, cursor: 'pointer' }}
                  >
                    <span className="block truncate">{name}</span>
                  </button>
                ) : (
                  <span className="block truncate font-semibold text-[14.5px]" style={{ color: 'var(--tg-theme-text-color, #1C1C1E)' }}>{name}</span>
                )

                return (
                  <div
                    key={d.id}
                    className="flex items-center gap-2.5 py-3"
                    style={{ borderBottom: index < donations.length - 1 ? '1px solid var(--tg-theme-secondary-bg-color, #F2F2F7)' : 'none' }}
                  >
                    {canNavigate ? (
                      <button type="button" onClick={handleDonorClick} className="shrink-0 outline-none" style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer' }}>
                        {avatarNode}
                      </button>
                    ) : (
                      avatarNode
                    )}
                    <div className="min-w-0 flex-1">
                      {donorNameNode}
                      <div className="mt-0.5 text-[12.5px]" style={{ color: 'var(--tg-theme-hint-color, #8E8E93)' }}>
                        {formatDonationDateTime(d.createdAt, i18n.language)}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="font-bold text-[14.5px]" style={{ color: '#1F8A5B' }}>
                        {d.amountHidden || d.amount == null ? '***' : `${Number(d.amount).toFixed(1)} ${d.currency}`}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
    </>
  )
}
