import { useState } from 'react'
import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000',
})

const getErrorMessage = (error, fallbackMessage) => {
  if (axios.isAxiosError(error)) {
    return (
      error.response?.data?.error ||
      error.response?.data?.message ||
      error.message ||
      fallbackMessage
    )
  }

  return fallbackMessage
}

function App() {
  const [query, setQuery] = useState('')
  const [location, setLocation] = useState('')
  const [businesses, setBusinesses] = useState([])
  const [error, setError] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [isExporting, setIsExporting] = useState(false)

  const handleSearch = async (event) => {
    event.preventDefault()

    const trimmedQuery = query.trim()
    const trimmedLocation = location.trim()

    if (!trimmedQuery || !trimmedLocation) {
      setError('Please enter both a business type and a location.')
      return
    }

    setIsSearching(true)
    setError('')

    try {
      const response = await api.get('/api/search', {
        params: { query: trimmedQuery, location: trimmedLocation },
      })

      setBusinesses(response.data.businesses ?? [])
    } catch (searchError) {
      setBusinesses([])
      setError(
        getErrorMessage(searchError, 'Unable to scrape Google Maps right now.')
      )
    } finally {
      setIsSearching(false)
    }
  }

  const handleExport = async () => {
    if (businesses.length === 0) {
      setError('Run a search before downloading the Excel file.')
      return
    }

    setIsExporting(true)
    setError('')

    try {
      const response = await api.get('/api/export', {
        responseType: 'blob',
      })

      const fileBlob = new Blob([response.data], {
        type: response.headers['content-type'],
      })
      const downloadUrl = window.URL.createObjectURL(fileBlob)
      const link = document.createElement('a')
      const contentDisposition = response.headers['content-disposition']
      const matchedFilename = contentDisposition?.match(/filename="(.+)"/)
      const fileName = matchedFilename?.[1] || 'businesses.xlsx'

      link.href = downloadUrl
      link.download = fileName
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(downloadUrl)
    } catch (exportError) {
      const exportMessage =
        exportError.response?.data instanceof Blob
          ? 'Excel export failed. Please try the search again.'
          : getErrorMessage(exportError, 'Excel export failed.')

      setError(exportMessage)
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-4 py-8 sm:px-6 lg:px-8">
        <section className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-slate-900/80 shadow-2xl shadow-slate-950/40">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(34,197,94,0.16),_transparent_32%),radial-gradient(circle_at_top_right,_rgba(56,189,248,0.2),_transparent_26%),linear-gradient(135deg,_rgba(15,23,42,0.95),_rgba(2,6,23,0.98))]" />
          <div className="relative grid gap-8 px-6 py-8 sm:px-10 lg:grid-cols-[1.15fr_0.85fr] lg:px-12 lg:py-12">
            <div className="max-w-3xl">
              <span className="inline-flex items-center rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-emerald-200">
                Google Maps Scraper
              </span>
              <h1 className="mt-6 max-w-2xl font-display text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                Scrape Google Maps listings without using the Google Places API.
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300 sm:text-base">
                Enter a business type and location, let the backend scrape Google
                Maps with Puppeteer, then review and export the collected results.
              </p>
              <div className="mt-8 grid gap-4 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-[0.24em] text-slate-400">
                    Results
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-white">
                    {businesses.length}
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-[0.24em] text-slate-400">
                    Source
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-white">
                    Maps
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-[0.24em] text-slate-400">
                    Export
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-white">XLSX</p>
                </div>
              </div>
            </div>

            <div className="rounded-[1.75rem] border border-white/10 bg-slate-950/70 p-5 backdrop-blur sm:p-6">
              <div className="mb-6">
                <h2 className="font-display text-2xl font-semibold text-white">
                  Start a search
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  Search by business type and city to scrape listing cards from
                  Google Maps.
                </p>
              </div>

              <form className="space-y-5" onSubmit={handleSearch}>
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-200">
                    Query
                  </span>
                  <input
                    className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-emerald-400/60 focus:ring-2 focus:ring-emerald-400/20"
                    placeholder="gyms"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-200">
                    Location
                  </span>
                  <input
                    className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-sky-400/60 focus:ring-2 focus:ring-sky-400/20"
                    placeholder="Mumbai"
                    value={location}
                    onChange={(event) => setLocation(event.target.value)}
                  />
                </label>

                <div className="flex flex-col gap-3 sm:flex-row">
                  <button
                    className="inline-flex flex-1 items-center justify-center rounded-2xl bg-emerald-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:bg-emerald-400/60"
                    type="submit"
                    disabled={isSearching}
                  >
                    {isSearching ? (
                      <>
                        <span className="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-950/30 border-t-slate-950" />
                        Searching...
                      </>
                    ) : (
                      'Search'
                    )}
                  </button>

                  <button
                    className="inline-flex flex-1 items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                    type="button"
                    disabled={businesses.length === 0 || isExporting || isSearching}
                    onClick={handleExport}
                  >
                    {isExporting ? 'Preparing Excel...' : 'Download Excel'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </section>

        {error ? (
          <div className="mt-6 rounded-2xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
            {error}
          </div>
        ) : null}

        <section className="mt-6 flex-1 rounded-[2rem] border border-slate-800 bg-slate-900/80 p-4 shadow-xl shadow-slate-950/30 sm:p-6">
          {isSearching ? (
            <div className="flex min-h-[320px] flex-col items-center justify-center rounded-[1.5rem] border border-dashed border-slate-700 bg-slate-950/50 text-center">
              <span className="h-10 w-10 animate-spin rounded-full border-4 border-slate-700 border-t-emerald-400" />
              <p className="mt-4 text-sm text-slate-300">
                Scraping Google Maps results...
              </p>
            </div>
          ) : businesses.length === 0 ? (
            <div className="flex min-h-[320px] flex-col items-center justify-center rounded-[1.5rem] border border-dashed border-slate-700 bg-slate-950/40 px-6 text-center">
              <h3 className="font-display text-2xl font-semibold text-white">
                No data yet
              </h3>
              <p className="mt-3 max-w-lg text-sm leading-6 text-slate-400">
                Run a search to scrape business listings and display them here.
              </p>
            </div>
          ) : (
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
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 bg-slate-900/50">
                    {businesses.map((business, index) => (
                      <tr
                        className="transition hover:bg-white/5"
                        key={`${business.name}-${business.address}-${index}`}
                      >
                        <td className="px-5 py-4 text-sm font-medium text-white">
                          {business.name || 'N/A'}
                        </td>
                        <td className="px-5 py-4 text-sm text-slate-300">
                          {business.address || 'N/A'}
                        </td>
                        <td className="px-5 py-4 text-sm text-slate-300">
                          {business.rating || 'N/A'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  )
}

export default App
