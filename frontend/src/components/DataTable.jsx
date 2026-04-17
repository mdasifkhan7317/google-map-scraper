function DataTable({ businesses, isLoading }) {
  if (isLoading) {
    return (
      <div className="flex min-h-[320px] flex-col items-center justify-center rounded-[1.5rem] border border-dashed border-slate-700 bg-slate-950/50 text-center">
        <span className="h-10 w-10 animate-spin rounded-full border-4 border-slate-700 border-t-emerald-400" />
        <p className="mt-4 text-sm text-slate-300">
          Fetching places from the backend...
        </p>
      </div>
    )
  }

  if (businesses.length === 0) {
    return (
      <div className="flex min-h-[320px] flex-col items-center justify-center rounded-[1.5rem] border border-dashed border-slate-700 bg-slate-950/40 px-6 text-center">
        <h3 className="font-display text-2xl font-semibold text-white">
          No data yet
        </h3>
        <p className="mt-3 max-w-lg text-sm leading-6 text-slate-400">
          Search for a business type and location to view Google Places results in
          a structured table.
        </p>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-[1.5rem] border border-slate-800">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-800">
          <thead className="bg-slate-950/80">
            <tr>
              <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                Name
              </th>
              <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                Address
              </th>
              <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                Rating
              </th>
              <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                Category
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 bg-slate-900/50">
            {businesses.map((business) => (
              <tr className="transition hover:bg-white/5" key={business.placeId || `${business.name}-${business.address}`}>
                <td className="px-5 py-4 text-sm font-medium text-white">
                  {business.name || 'N/A'}
                </td>
                <td className="px-5 py-4 text-sm text-slate-300">
                  {business.address || 'N/A'}
                </td>
                <td className="px-5 py-4 text-sm text-slate-300">
                  {business.rating ?? 'N/A'}
                </td>
                <td className="px-5 py-4 text-sm text-slate-300">
                  {business.category || 'N/A'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default DataTable
