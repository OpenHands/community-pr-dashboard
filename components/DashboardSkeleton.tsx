/** Pulse-animated placeholder that mirrors the dashboard layout. */
export default function DashboardSkeleton({ darkMode }: { darkMode: boolean }) {
  const pulse = darkMode ? 'bg-gray-700' : 'bg-gray-200'
  const card  = `${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-lg shadow-sm`

  // A single animated bar — no keys needed because adjacent siblings are not in arrays
  const bar = (cls: string) => (
    <div className={`animate-pulse rounded ${pulse} ${cls}`} />
  )

  return (
    <>
      {/* KPI cards — 4-column grid */}
      <section className="py-6">
        {bar('h-7 w-56 mb-4')}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className={`${card} p-5`}>
              {bar('h-3 w-2/3 mb-3')}
              {bar('h-9 w-1/3 mb-2')}
              {bar('h-3 w-1/2')}
            </div>
          ))}
        </div>
      </section>

      {/* Review Accountability — 3-column grid */}
      <section className="py-6">
        {bar('h-7 w-64 mb-4')}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className={`${card} p-5`}>
              {bar('h-3 w-2/3 mb-3')}
              {bar('h-9 w-1/3 mb-2')}
              {bar('h-3 w-1/2')}
            </div>
          ))}
        </div>
      </section>

      {/* Reviewer Stats table */}
      <section className="py-6">
        <div className={`${card} p-5`}>
          {bar('h-5 w-72 mb-5')}
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex gap-4">
                {bar('h-4 w-28 shrink-0')}
                {bar('h-4 flex-1')}
                {bar('h-4 flex-1')}
                {bar('h-4 flex-1')}
                {bar('h-4 flex-1')}
                {bar('h-4 flex-1')}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Filters */}
      <section className="py-6">
        <div className={`${card} p-5`}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className={`animate-pulse rounded ${pulse} h-9`} />
            ))}
          </div>
        </div>
      </section>

      {/* PR table */}
      <section className="py-6">
        <div className={`${card} overflow-hidden`}>
          <div className={`px-5 py-4 border-b ${darkMode ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-200'}`}>
            {bar('h-6 w-56')}
          </div>
          <div className="p-4 space-y-2">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className={`animate-pulse rounded ${pulse} h-12`} />
            ))}
          </div>
        </div>
      </section>
    </>
  )
}
