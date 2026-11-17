export function CampaignCardSkeleton() {
  return (
    <div className="rounded-2xl border border-gray-100 shadow-sm p-4 bg-[var(--tg-theme-secondary-bg-color,#f9f9f9)] animate-pulse">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="h-4 bg-gray-200 rounded w-3/4" />
        <div className="h-5 bg-gray-200 rounded-full w-12 shrink-0" />
      </div>
      <div className="h-3 bg-gray-200 rounded w-full mb-1" />
      <div className="h-3 bg-gray-200 rounded w-2/3 mb-3" />
      <div className="h-1.5 bg-gray-200 rounded-full w-full mb-2" />
      <div className="flex justify-between">
        <div className="h-3 bg-gray-200 rounded w-1/2" />
        <div className="h-3 bg-gray-200 rounded w-1/6" />
      </div>
    </div>
  )
}
