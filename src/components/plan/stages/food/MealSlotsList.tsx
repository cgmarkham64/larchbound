import { SLOTS } from './dayMealDialog.helpers'
import type { WeightUnit } from './dayMealDialog.helpers'
import { SlotSection } from './SlotSection'
import type { MealItem, MealSlot } from '../../types'
import type { MacroResult } from '../../../../lib/food'

type MealSlotsListProps = {
  slots: Record<MealSlot, MealItem[]>
  loading: Set<string>
  weightUnit: WeightUnit
  pendingCandidates: Record<string, MacroResult[]>
  lookupErrors: Record<string, string>
  onAdd: (slot: MealSlot) => void
  onUpdate: (slot: MealSlot, id: string, patch: Partial<MealItem>) => void
  onRemove: (slot: MealSlot, id: string) => void
  onLookup: (id: string, name: string) => void
  onSelectCandidate: (slot: MealSlot, id: string, c: MacroResult) => void
  onDismissCandidates: (id: string) => void
}

export function MealSlotsList({
  slots, loading, weightUnit, pendingCandidates, lookupErrors, onAdd, onUpdate, onRemove, onLookup, onSelectCandidate, onDismissCandidates,
}: MealSlotsListProps) {
  return (
    <div className="overflow-y-auto p-5 flex flex-col gap-5">
      {SLOTS.map(slot => (
        <SlotSection
          key={slot}
          slot={slot}
          items={slots[slot]}
          loading={loading}
          weightUnit={weightUnit}
          pendingCandidates={pendingCandidates}
          lookupErrors={lookupErrors}
          onAdd={() => onAdd(slot)}
          onUpdate={(id, patch) => onUpdate(slot, id, patch)}
          onRemove={id => onRemove(slot, id)}
          onLookup={onLookup}
          onSelectCandidate={(id, c) => onSelectCandidate(slot, id, c)}
          onDismissCandidates={onDismissCandidates}
        />
      ))}
    </div>
  )
}
