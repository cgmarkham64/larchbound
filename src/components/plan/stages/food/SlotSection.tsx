import { IconPlus } from '../../../icons'
import { SLOT_LABELS } from './dayMealDialog.helpers'
import type { WeightUnit } from './dayMealDialog.helpers'
import { ItemRow } from './ItemRow'
import type { MealItem, MealSlot } from '../../types'
import type { MacroResult } from '../../../../lib/food'

type SlotSectionProps = {
  slot: MealSlot
  items: MealItem[]
  loading: Set<string>
  weightUnit: WeightUnit
  pendingCandidates: Record<string, MacroResult[]>
  lookupErrors: Record<string, string>
  onAdd: () => void
  onUpdate: (id: string, patch: Partial<MealItem>) => void
  onRemove: (id: string) => void
  onLookup: (id: string, name: string) => void
  onSelectCandidate: (id: string, c: MacroResult) => void
  onDismissCandidates: (id: string) => void
}

export function SlotSection({
  slot, items, loading, weightUnit, pendingCandidates, lookupErrors, onAdd, onUpdate, onRemove, onLookup, onSelectCandidate, onDismissCandidates,
}: SlotSectionProps) {
  return (
    <div>
      <div className="font-mono text-label tracking-[0.14em] uppercase text-text-dim mb-2">
        {SLOT_LABELS[slot]}
      </div>
      <div className="flex flex-col gap-2">
        {items.map(item => (
          <ItemRow
            key={item.id}
            item={item}
            isLoading={loading.has(item.id)}
            weightUnit={weightUnit}
            candidates={pendingCandidates[item.id] ?? []}
            lookupError={lookupErrors[item.id]}
            onUpdate={patch => onUpdate(item.id, patch)}
            onRemove={() => onRemove(item.id)}
            onLookup={name => onLookup(item.id, name)}
            onSelectCandidate={c => onSelectCandidate(item.id, c)}
            onDismissCandidates={() => onDismissCandidates(item.id)}
          />
        ))}
        <button
          type="button"
          onClick={onAdd}
          className="self-start inline-flex items-center gap-1.5 font-heading text-caption font-bold tracking-[0.08em] uppercase px-2.5 py-1.5 rounded border border-dashed border-border text-text-dim hover:border-border-mid hover:text-text-mid transition-colors cursor-pointer"
        >
          <IconPlus size={10} /> Add item
        </button>
      </div>
    </div>
  )
}
