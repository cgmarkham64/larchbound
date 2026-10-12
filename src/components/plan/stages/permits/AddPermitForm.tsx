import { useState } from 'react'
import { IconSearch, IconPlus } from '../../../icons'
import { AiQuotaBadge } from '../../AiQuotaBadge'

type AddPermitFormProps = {
  onSearch: (name: string) => void
  lookupLoading: boolean
  lookupError: string | null
  canLookup: boolean
  onAddFreeform: () => void
}

export function AddPermitForm({ onSearch, lookupLoading, lookupError, canLookup, onAddFreeform }: AddPermitFormProps) {
  const [search, setSearch] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (search.trim() && canLookup && !lookupLoading) onSearch(search.trim())
  }

  return (
    <section className="pt-1">
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <div className="font-mono text-label tracking-[0.16em] uppercase text-text-dim">Add a permit</div>
        <AiQuotaBadge />
      </div>
      <form onSubmit={handleSubmit} className="flex gap-2.5 p-1 bg-surface border border-border rounded-lg">
        <div className="flex-1 flex items-center gap-2 px-3 text-text-dim">
          {lookupLoading
            ? <span className="w-3.5 h-3.5 rounded-full border-2 border-amber border-t-transparent animate-spin shrink-0" />
            : <IconSearch />
          }
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Permit name (e.g. Whitney overnight permit)…"
            disabled={lookupLoading}
            className="flex-1 bg-transparent border-none text-body-sm text-text outline-none py-2.5 placeholder:text-text-dim disabled:opacity-50"
          />
        </div>
        <button
          type="submit"
          disabled={!search.trim() || lookupLoading || !canLookup}
          className="inline-flex items-center gap-1.5 font-heading text-caption font-bold tracking-[0.08em] uppercase px-3.5 py-2 border-l border-border text-amber bg-transparent hover:bg-amber-dim transition-colors cursor-pointer rounded-r disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {lookupLoading ? 'Searching…' : 'Look up'}
        </button>
      </form>
      {lookupError && <div className="mt-1.5 font-mono text-label text-red">{lookupError}</div>}
      {!canLookup && <div className="mt-1.5 font-mono text-label text-text-dim">Link a trip in Stage 1 to enable AI permit lookup.</div>}
      <button
        onClick={onAddFreeform}
        className="mt-2 inline-flex items-center gap-1 font-mono text-label text-text-dim hover:text-text transition-colors bg-transparent border-none cursor-pointer p-0"
      >
        <IconPlus size={9} /> Add without AI lookup
      </button>
    </section>
  )
}
