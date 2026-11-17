export function PageSkeleton() {
  return (
    <div className="px-4 pt-4 pb-8 flex flex-col gap-4 animate-pulse">
      <div className="h-6 bg-gray-200 rounded w-1/2" />
      <div className="h-4 bg-gray-200 rounded w-full" />
      <div className="h-4 bg-gray-200 rounded w-3/4" />
      <div className="h-2 bg-gray-200 rounded-full w-full mt-2" />
      <div className="flex gap-4 mt-1">
        <div className="h-3 bg-gray-200 rounded w-1/4" />
        <div className="h-3 bg-gray-200 rounded w-1/4" />
      </div>
      <div className="h-32 bg-gray-200 rounded-2xl mt-2" />
      <div className="h-4 bg-gray-200 rounded w-full" />
      <div className="h-4 bg-gray-200 rounded w-5/6" />
    </div>
  )
}
