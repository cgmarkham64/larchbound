import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { UseFormSetValue, UseFormHandleSubmit, UseFormGetValues } from 'react-hook-form'
import type { Trip, JournalDay } from '../../types'
import { useSaveJournalDay } from '../../hooks/useJournalDays'
import { api } from '../../lib/api'
import { shareTrip } from '../../lib/users'
import {
  SAVED_FEEDBACK_TIMEOUT_MS, MIN_SAVE_OVERLAY_MS,
  buildSaveInput, fileToBase64, applyScannedFields,
} from './journalEntryForm.helpers'
import type { FormValues } from './journalEntryForm.types'

function waitForMinOverlay(startedAt: number): Promise<void> {
  const remaining = MIN_SAVE_OVERLAY_MS - (Date.now() - startedAt)
  return remaining > 0 ? new Promise(r => setTimeout(r, remaining)) : Promise.resolve()
}

function usePendingShares(tripId: string) {
  const pendingShareSubsRef = useRef<string[]>([])
  const [pendingInviteCount, setPendingInviteCount] = useState(0)

  function addPendingShare(sub: string) {
    if (!pendingShareSubsRef.current.includes(sub)) {
      pendingShareSubsRef.current.push(sub)
      setPendingInviteCount(pendingShareSubsRef.current.length)
    }
  }

  async function flushPendingShares() {
    const subs = pendingShareSubsRef.current.slice()
    pendingShareSubsRef.current = []
    setPendingInviteCount(0)
    for (const sub of subs) {
      try { await shareTrip(tripId, sub) } catch { /* non-fatal */ }
    }
  }

  return { pendingInviteCount, addPendingShare, flushPendingShares }
}

export function useJournalEntrySave(trip: Trip, selectedDate: string, dayNumber: number, currentEntry: JournalDay | undefined) {
  const save = useSaveJournalDay(trip._id)
  const [saving, setSaving] = useState(false)
  const [savedFeedback, setSavedFeedback] = useState(false)
  const saveStartRef = useRef(0)
  const { pendingInviteCount, addPendingShare, flushPendingShares } = usePendingShares(trip._id)

  async function submit(data: FormValues, sys: 'imperial' | 'metric', wildlife: string[], companions: string[]) {
    setSaving(true)
    saveStartRef.current = Date.now()
    try {
      const input = buildSaveInput(data, trip, selectedDate, dayNumber, sys, wildlife, companions)
      await save.mutateAsync({ id: currentEntry?._id, input })
      await waitForMinOverlay(saveStartRef.current)
      await flushPendingShares()
      setSavedFeedback(true)
      setTimeout(() => setSavedFeedback(false), SAVED_FEEDBACK_TIMEOUT_MS)
    } finally {
      setSaving(false)
    }
  }

  return { save, saving, savedFeedback, pendingInviteCount, addPendingShare, submit }
}

export function useFormAutoSave(
  handleSubmit: UseFormHandleSubmit<FormValues>,
  onSubmit: (data: FormValues) => Promise<void>,
  isDirty: boolean,
  panelsDirtyRef: { current: boolean },
  getValues: UseFormGetValues<FormValues>,
  readOnly: boolean | undefined,
) {
  return function handleFormBlur(e: React.FocusEvent<HTMLFormElement>) {
    if (readOnly) return
    if (e.currentTarget.contains(e.relatedTarget as Node)) return
    if (!isDirty && !panelsDirtyRef.current) return
    if (!getValues('body').trim()) return
    handleSubmit(onSubmit)()
  }
}

export function useJournalScan(sys: 'imperial' | 'metric', setValue: UseFormSetValue<FormValues>) {
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState<string | null>(null)
  const qc = useQueryClient()

  async function handleScanFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    setScanError(null)
    setScanning(true)

    try {
      const base64 = await fileToBase64(file)
      const { data } = await api.post<Partial<FormValues>>('/api/journal-scan', {
        imageBase64: base64,
        mediaType: file.type,
      })
      qc.invalidateQueries({ queryKey: ['ai-usage'] })

      applyScannedFields(data, sys, setValue)

      // Blur any focused field so the auto-save fires while the scan overlay is still up
      ;(document.activeElement as HTMLElement)?.blur()
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'Scan failed — check the image and try again'
      setScanError(message)
    } finally {
      setScanning(false)
    }
  }

  return { scanning, scanError, handleScanFile }
}
