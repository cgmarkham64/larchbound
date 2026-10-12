import { useState } from 'react'
import type { PlanMealEntry } from '../../types'
import { Modal } from '../../../ui/Modal'
import { SLOTS, sumDayField } from './dayMealDialog.helpers'
import type { WeightUnit } from './dayMealDialog.helpers'
import { useMealSlotsState, useNutritionLookup, useCopyToDays } from './dayMealDialog.hooks'
import { DayMealDialogHeader } from './DayMealDialogHeader'
import { MealSlotsList } from './MealSlotsList'
import { CopyToDaysPicker } from './CopyToDaysPicker'
import { DayTotalsBar } from './DayTotalsBar'

type MealRow = PlanMealEntry

type DayMealDialogProps = {
  day: MealRow
  dayIndex: number
  totalDays: number
  onSave: (updated: MealRow) => void
  onCopyTo: (targetIndices: number[]) => void
  onClose: () => void
}

export function DayMealDialog({ day, dayIndex, totalDays, onSave, onCopyTo, onClose }: DayMealDialogProps) {
  const [weightUnit, setWeightUnit] = useState<WeightUnit>('oz')
  const { slots, addItem, updateItem, removeItem } = useMealSlotsState(day, onSave)
  const { loading, pendingCandidates, lookupErrors, selectCandidate, dismissCandidates, lookupItem } = useNutritionLookup(updateItem)
  const copy = useCopyToDays(onCopyTo)

  const allItems = SLOTS.flatMap(s => slots[s])

  return (
    <Modal onClose={onClose} panelClassName="bg-surface border border-border rounded-lg w-full max-w-[680px] mx-4 flex flex-col max-h-[82vh]">
      <DayMealDialogHeader dayNumber={day.n} weightUnit={weightUnit} onWeightUnitChange={setWeightUnit} onClose={onClose} />

      <MealSlotsList
        slots={slots}
        loading={loading}
        weightUnit={weightUnit}
        pendingCandidates={pendingCandidates}
        lookupErrors={lookupErrors}
        onAdd={addItem}
        onUpdate={updateItem}
        onRemove={removeItem}
        onLookup={lookupItem}
        onSelectCandidate={selectCandidate}
        onDismissCandidates={dismissCandidates}
      />

      <div className="border-t border-border px-5 pt-2 pb-1 shrink-0">
        <p className="font-mono text-label text-text-dim">Lookup results are AI-assisted estimates · verify against product label</p>
      </div>

      {copy.showCopyPicker && (
        <CopyToDaysPicker
          totalDays={totalDays}
          dayIndex={dayIndex}
          copyTargets={copy.copyTargets}
          setCopyTargets={copy.setCopyTargets}
          onToggleTarget={copy.toggleCopyTarget}
          onApply={copy.applyCopy}
          onCancel={() => { copy.setShowCopyPicker(false); copy.setCopyTargets(new Set()) }}
        />
      )}

      <DayTotalsBar
        dayKcal={sumDayField(allItems, 'kcal')}
        dayProtein={sumDayField(allItems, 'proteinG')}
        dayFat={sumDayField(allItems, 'fatG')}
        dayCarbs={sumDayField(allItems, 'carbsG')}
        dayWeightOz={sumDayField(allItems, 'weightOz')}
        weightUnit={weightUnit}
        totalDays={totalDays}
        showCopyPicker={copy.showCopyPicker}
        onToggleCopyPicker={() => copy.setShowCopyPicker(v => !v)}
        onClose={onClose}
      />
    </Modal>
  )
}
