interface DashboardSkeletonProps {
  darkMode?: boolean;
}

function SkeletonBlock({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-gray-200 ${className}`} />;
}

function KpiCardSkeleton({ darkMode }: { darkMode?: boolean }) {
  return (
    <div className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-lg p-5 shadow-sm`}>
      <SkeletonBlock className="h-3 w-24 mb-3" />
      <SkeletonBlock className="h-8 w-16 mb-2" />
      <SkeletonBlock className="h-3 w-32" />
    </div>
  );
}

function TableRowSkeleton() {
  return (
    <tr>
      {[40, 16, 12, 12, 14, 16].map((w, i) => (
        <td key={i} className="px-4 py-3">
          <SkeletonBlock className={`h-4 w-${w}`} />
        </td>
      ))}
    </tr>
  );
}

export default function DashboardSkeleton({ darkMode }: DashboardSkeletonProps) {
  return (
    <div>
      {/* KPI cards */}
      <section className="py-6">
        <SkeletonBlock className="h-6 w-48 mb-4" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <KpiCardSkeleton key={i} darkMode={darkMode} />
          ))}
        </div>
      </section>

      {/* PR table */}
      <section className="pb-6">
        <SkeletonBlock className="h-6 w-40 mb-4" />
        <div className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-lg overflow-hidden shadow-sm`}>
          <table className="w-full">
            <thead>
              <tr className={`${darkMode ? 'bg-gray-700' : 'bg-gray-50'} border-b ${darkMode ? 'border-gray-600' : 'border-gray-200'}`}>
                {['Title', 'Repo', 'Age', 'Status', 'Reviewers', 'Labels'].map(h => (
                  <th key={h} className="px-4 py-3 text-left">
                    <SkeletonBlock className="h-3 w-16" />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className={`divide-y ${darkMode ? 'divide-gray-700' : 'divide-gray-200'}`}>
              {Array.from({ length: 10 }).map((_, i) => (
                <TableRowSkeleton key={i} />
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
