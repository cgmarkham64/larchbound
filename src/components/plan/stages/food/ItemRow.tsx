import { IconX, IconSearch } from '../../../icons'
import { INPUT_CLS } from './dayMealDialog.helpers'
import type { WeightUnit } from './dayMealDialog.helpers'
import { NutritionCandidates } from './NutritionCandidates'
import { ItemMacroFields } from './ItemMacroFields'
import type { MealItem } from '../../types'
import type { MacroResult } from '../../../../lib/food'

type ItemRowProps = {
  item: MealItem
  isLoading: boolean
  weightUnit: WeightUnit
  candidates: MacroResult[]
  lookupError?: string
  onUpdate: (patch: Partial<MealItem>) => void
  onRemove: () => void
  onLookup: (name: string) => void
  onSelectCandidate: (c: MacroResult) => void
  onDismissCandidates: () => void
}

function LookupButton({ item, isLoading, onLookup }: { item: MealItem; isLoading: boolean; onLookup: (name: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => item.name.trim() && onLookup(item.name.trim())}
      disabled={isLoading || !item.name.trim()}
      title="Search for nutrition info"
      className="shrink-0 inline-flex items-center gap-1 font-heading text-caption font-bold tracking-[0.08em] uppercase px-2 py-1 rounded border border-amber-border bg-amber-dim text-amber hover:bg-amber transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {isLoading
        ? <span className="w-3 h-3 rounded-full border-2 border-amber border-t-transparent animate-spin inline-block" />
        : <IconSearch />
      }
      {!isLoading && 'Lookup'}
    </button>
  )
}

export function ItemRow({ item, isLoading, weightUnit, candidates, lookupError, onUpdate, onRemove, onLookup, onSelectCandidate, onDismissCandidates }: ItemRowProps) {
  return (
    <div className="bg-surface-2 border border-border rounded-lg p-2.5 flex flex-col gap-2">
      <div className="flex items-center gap-1.5">
        <input
          className={`flex-1 ${INPUT_CLS} text-body-sm`}
          placeholder="Item name…"
          value={item.name}
          onChange={e => onUpdate({ name: e.target.value })}
        />
        <LookupButton item={item} isLoading={isLoading} onLookup={onLookup} />
        <button type="button" onClick={onRemove} className="shrink-0 text-text-dim hover:text-text transition-colors cursor-pointer" aria-label="Remove item">
          <IconX size={13} />
        </button>
      </div>

      <NutritionCandidates candidates={candidates} weightUnit={weightUnit} onSelect={onSelectCandidate} onDismiss={onDismissCandidates} />
      <ItemMacroFields item={item} weightUnit={weightUnit} onUpdate={onUpdate} />

      {lookupError && (
        <p className="font-mono text-label text-red truncate" title={lookupError}>
          ⚠ {lookupError}
        </p>
      )}
      {!lookupError && item.lookupNote && (
        <p className="font-mono text-label text-text-dim truncate" title={item.lookupNote}>
          ↳ {item.lookupNote}
        </p>
      )}
    </div>
  )
}
