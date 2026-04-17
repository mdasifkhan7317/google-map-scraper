import { useEffect, useState } from 'react'

function SearchForm({
  defaultValues,
  isLoading,
  isExporting,
  hasResults,
  onSearch,
  onExport,
}) {
  const [formValues, setFormValues] = useState(defaultValues)
  const [formError, setFormError] = useState('')

  useEffect(() => {
    setFormValues(defaultValues)
  }, [defaultValues])

  const handleChange = (event) => {
    const { name, value } = event.target

    setFormValues((currentValues) => ({
      ...currentValues,
      [name]: value,
    }))
  }

  const handleSubmit = (event) => {
    event.preventDefault()

    const query = formValues.query.trim()
    const location = formValues.location.trim()

    if (!query || !location) {
      setFormError('Business type and location are both required.')
      return
    }

    setFormError('')
    onSearch({ query, location })
  }

  return (
    <div className="rounded-[1.75rem] border border-white/10 bg-slate-950/70 p-5 backdrop-blur sm:p-6">
      <div className="mb-6">
        <h2 className="font-display text-2xl font-semibold text-white">
          Start a search
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          Enter a business type like <span className="text-slate-200">gyms</span>{' '}
          or <span className="text-slate-200">restaurants</span>, then pick a
          location such as <span className="text-slate-200">Mumbai</span>.
        </p>
      </div>

      <form className="space-y-5" onSubmit={handleSubmit}>
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-slate-200">
            Business Type
          </span>
          <input
            className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-emerald-400/60 focus:ring-2 focus:ring-emerald-400/20"
            name="query"
            placeholder="gyms, restaurants, cafes"
            value={formValues.query}
            onChange={handleChange}
          />
        </label>

        <label className="block">
          <span className="mb-2 block text-sm font-medium text-slate-200">
            Location
          </span>
          <input
            className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-sky-400/60 focus:ring-2 focus:ring-sky-400/20"
            name="location"
            placeholder="Mumbai"
            value={formValues.location}
            onChange={handleChange}
          />
        </label>

        {formError ? (
          <p className="rounded-2xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
            {formError}
          </p>
        ) : null}

        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            className="inline-flex flex-1 items-center justify-center rounded-2xl bg-emerald-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:bg-emerald-400/60"
            type="submit"
            disabled={isLoading}
          >
            {isLoading ? (
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
            disabled={!hasResults || isExporting || isLoading}
            onClick={onExport}
          >
            {isExporting ? 'Preparing Excel...' : 'Download Excel'}
          </button>
        </div>
      </form>
    </div>
  )
}

export default SearchForm
