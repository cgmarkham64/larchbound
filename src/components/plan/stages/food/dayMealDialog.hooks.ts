import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { lookupMacros } from '../../../../lib/food'
import type { MacroResult } from '../../../../lib/food'
import type { MealItem, MealSlot, PlanMealEntry } from '../../types'
import { blankItem } from './dayMealDialog.helpers'
import { extractApiError } from '../../../../lib/utils'

type MealRow = PlanMealEntry

function initialSlots(day: MealRow): Record<MealSlot, MealItem[]> {
  return {
    breakfast: [...day.items.breakfast],
    lunch:     [...day.items.lunch],
    dinner:    [...day.items.dinner],
    snacks:    [...day.items.snacks],
  }
}

export function useMealSlotsState(day: MealRow, onSave: (updated: MealRow) => void) {
  const [slots, setSlots] = useState<Record<MealSlot, MealItem[]>>(() => initialSlots(day))
  const onSaveRef = useRef(onSave)
  useEffect(() => { onSaveRef.current = onSave })

  function applyUpdate(updated: Record<MealSlot, MealItem[]>) {
    setSlots(updated)
    onSaveRef.current({ ...day, items: updated })
  }

  return {
    slots,
    addItem: (slot: MealSlot) => applyUpdate({ ...slots, [slot]: [...slots[slot], blankItem()] }),
    updateItem: (slot: MealSlot, id: string, patch: Partial<MealItem>) =>
      applyUpdate({ ...slots, [slot]: slots[slot].map(i => i.id === id ? { ...i, ...patch } : i) }),
    removeItem: (slot: MealSlot, id: string) =>
      applyUpdate({ ...slots, [slot]: slots[slot].filter(i => i.id !== id) }),
  }
}

export function useNutritionLookup(updateItem: (slot: MealSlot, id: string, patch: Partial<MealItem>) => void) {
  const [loading, setLoading] = useState<Set<string>>(new Set())
  const [pendingCandidates, setPendingCandidates] = useState<Record<string, MacroResult[]>>({})
  const [lookupErrors, setLookupErrors] = useState<Record<string, string>>({})
  const qc = useQueryClient()

  function dismissCandidates(id: string) {
    setPendingCandidates(prev => { const next = { ...prev }; delete next[id]; return next })
  }

  function dismissLookupError(id: string) {
    setLookupErrors(prev => { const next = { ...prev }; delete next[id]; return next })
  }

  function selectCandidate(slot: MealSlot, id: string, c: MacroResult) {
    dismissCandidates(id)
    updateItem(slot, id, { kcal: c.kcal, proteinG: c.proteinG, fatG: c.fatG, carbsG: c.carbsG, weightOz: c.weightOz, lookupNote: c.note })
  }

  async function lookupItem(id: string, name: string) {
    setLoading(prev => new Set(prev).add(id))
    dismissLookupError(id)
    try {
      const candidates = await lookupMacros(name)
      setPendingCandidates(prev => ({ ...prev, [id]: candidates }))
      qc.invalidateQueries({ queryKey: ['ai-usage'] })
    } catch (err) {
      setLookupErrors(prev => ({ ...prev, [id]: extractApiError(err) ?? 'Macro lookup failed' }))
    } finally {
      setLoading(prev => { const s = new Set(prev); s.delete(id); return s })
    }
  }

  return { loading, pendingCandidates, lookupErrors, selectCandidate, dismissCandidates, dismissLookupError, lookupItem }
}

export function useCopyToDays(onCopyTo: (targetIndices: number[]) => void) {
  const [showCopyPicker, setShowCopyPicker] = useState(false)
  const [copyTargets, setCopyTargets] = useState<Set<number>>(new Set())

  function toggleCopyTarget(i: number) {
    setCopyTargets(prev => {
      const next = new Set(prev)
      if (next.has(i)) { next.delete(i) } else { next.add(i) }
      return next
    })
  }

  function applyCopy() {
    onCopyTo([...copyTargets])
    setShowCopyPicker(false)
    setCopyTargets(new Set())
  }

  return { showCopyPicker, setShowCopyPicker, copyTargets, setCopyTargets, toggleCopyTarget, applyCopy }
}
