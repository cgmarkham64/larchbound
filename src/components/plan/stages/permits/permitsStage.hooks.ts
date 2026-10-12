import { useState, useEffect, useRef, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { Dispatch, SetStateAction } from 'react'
import type { Trip } from '../../../../types'
import { suggestPermits, lookupPermit, pickZoneProduct } from '../../../../lib/permits'
import type { PermitLookupResult, ZoneProductResult } from '../../../../lib/permits'
import type { PermitNeed } from '../../../../lib/zoneGeometry'
import {
  detectZoneStays, buildZonePermit, buildLotteryProduct, buildAdvanceReservationProduct,
  buildSelfRegisterPermit, requireSeasonBound, routeSignature, zoneNeedId,
} from './zoneDetection.helpers'
import { extractApiError } from '../../../../lib/utils'
import { toDateMs, extractScanDates } from './criticalDates.helpers'
import { INITIAL_PERMITS } from './permitsStage.constants'
import type { Permit } from './permitsStage.types'
import type { PlanData, PlanRouteData, PlanCriticalDate, PermitLink } from '../../types'

// ─── Persisted state ───────────────────────────────────────────────────────

export function usePermitsPersistedState(plan: PlanData | undefined) {
  const [permits, setPermits] = useState<Permit[]>(
    () => (plan?.permits?.permits as Permit[] | undefined) ?? (plan !== undefined ? [] : INITIAL_PERMITS)
  )
  const [links, setLinks]                     = useState<PermitLink[]>(() => plan?.permits?.links ?? [])
  const [lastScanned, setLastScanned]         = useState<string | undefined>(() => plan?.permits?.lastScanned)
  const [permitFree, setPermitFree]           = useState(() => plan?.permits?.permitFree ?? false)
  const [partyConfirmed, setPartyConfirmed]   = useState(() => plan?.permits?.partyConfirmed ?? false)
  const [backupPlanned, setBackupPlanned]     = useState(() => plan?.permits?.backupPlanned ?? false)
  const [criticalDates, setCriticalDates]     = useState<PlanCriticalDate[]>(() => plan?.permits?.criticalDates ?? [])
  const [zoneDetectedAt, setZoneDetectedAt]   = useState<string | undefined>(() => plan?.permits?.zoneDetectedAt)
  const [zoneDetectedSignature, setZoneDetectedSignature] =
    useState<string | undefined>(() => plan?.permits?.zoneDetectedSignature)

  return {
    permits, setPermits, links, setLinks, lastScanned, setLastScanned,
    permitFree, setPermitFree, partyConfirmed, setPartyConfirmed, backupPlanned, setBackupPlanned,
    criticalDates, setCriticalDates, zoneDetectedAt, setZoneDetectedAt, zoneDetectedSignature, setZoneDetectedSignature,
  }
}

type PersistedState = {
  permits: Permit[]; permitFree: boolean; partyConfirmed: boolean; backupPlanned: boolean
  links: PermitLink[]; lastScanned: string | undefined; criticalDates: PlanCriticalDate[]
  zoneDetectedAt: string | undefined; zoneDetectedSignature: string | undefined
}

export function usePermitsPersist(onChange: ((patch: Partial<PlanData>) => void) | undefined, state: PersistedState) {
  const isMounted = useRef(false)
  useEffect(() => () => { isMounted.current = false }, [])
  const onChangeRef = useRef(onChange)
  useEffect(() => { onChangeRef.current = onChange }, [onChange])

  const {
    permits, permitFree, partyConfirmed, backupPlanned, links, lastScanned, criticalDates,
    zoneDetectedAt, zoneDetectedSignature,
  } = state

  useEffect(() => {
    if (!isMounted.current) { isMounted.current = true; return }
    onChangeRef.current?.({
      permits: {
        permits, permitFree, partyConfirmed, backupPlanned, links, lastScanned, criticalDates,
        zoneDetectedAt, zoneDetectedSignature,
      },
    })
  }, [
    permits, permitFree, partyConfirmed, backupPlanned, links, lastScanned, criticalDates,
    zoneDetectedAt, zoneDetectedSignature,
  ])
}

const CHECKLIST_TOTAL = 3
const PERCENT_MULTIPLIER = 100

export function usePermitsProgress(
  onProgress: ((done: number, total: number) => void) | undefined,
  doneCount: number,
  permitFree: boolean,
) {
  const onProgressRef = useRef(onProgress)
  useEffect(() => { onProgressRef.current = onProgress }, [onProgress])
  useEffect(() => {
    onProgressRef.current?.(permitFree ? 2 : doneCount, permitFree ? 2 : CHECKLIST_TOTAL)
  }, [doneCount, permitFree])
}

// ─── Resource scan ───────────────────────────────────────────────────────────

async function performScan(
  tripId: string,
  setLinks: Dispatch<SetStateAction<PermitLink[]>>,
  setLastScanned: Dispatch<SetStateAction<string | undefined>>,
  setScanError: Dispatch<SetStateAction<string | null>>,
): Promise<boolean> {
  try {
    const { links: found } = await suggestPermits(tripId)
    setLinks(found)
    setLastScanned(new Date().toISOString())
    return true
  } catch (err) {
    setScanError(extractApiError(err) ?? 'Scan failed')
    return false
  }
}

export function useScan(
  trip: Trip | undefined,
  setLinks: Dispatch<SetStateAction<PermitLink[]>>,
  lastScanned: string | undefined,
  setLastScanned: Dispatch<SetStateAction<string | undefined>>,
) {
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState<string | null>(null)
  const qc = useQueryClient()

  async function runScan() {
    if (!trip?._id || scanning) return
    setScanning(true)
    setScanError(null)
    const succeeded = await performScan(trip._id, setLinks, setLastScanned, setScanError)
    if (succeeded) qc.invalidateQueries({ queryKey: ['ai-usage'] })
    setScanning(false)
  }

  const autoScannedRef = useRef(false)
  useEffect(() => {
    if (trip?._id && trip.gpxPlanned && !lastScanned && !autoScannedRef.current) {
      autoScannedRef.current = true
      runScan()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip?._id])

  return { scanning, scanError, runScan }
}

// ─── Zone-geometry auto-detection ────────────────────────────────────────────

function pruneStaleZonePermits(prev: Permit[], currentNeedIds: Set<string>): Permit[] {
  // Drop auto-detected permits whose zone-stay no longer exists on the route.
  // Never touches manually-added permits or ones a user has since edited away
  // from autoDetected — only ids we generated ourselves for a need that's gone.
  return prev.filter(p => !(p.autoDetected && p.id.startsWith('zone_') && !currentNeedIds.has(p.id)))
}

function reconcileZoneNeeds(
  needs: PermitNeed[], selfRegister: PermitNeed[], permits: Permit[], currentNeedIds: Set<string>,
): { toAdd: PermitNeed[]; toAddSelfReg: PermitNeed[] } {
  const existingIds = new Set(permits.filter(p => currentNeedIds.has(p.id)).map(p => p.id))
  return {
    toAdd: needs.filter(n => !existingIds.has(zoneNeedId(n))),
    toAddSelfReg: selfRegister.filter(n => !existingIds.has(zoneNeedId(n))),
  }
}

async function resolveZoneProduct(tripId: string, need: PermitNeed): Promise<ZoneProductResult> {
  const p = need.zone.properties
  if (p.overnight_permit.allocation === 'lottery') return buildLotteryProduct(p)
  if (p.overnight_permit.allocation === 'advance-reservation') return buildAdvanceReservationProduct(p)
  return pickZoneProduct(tripId, {
    zoneName:             p.name,
    agency:               p.agency,
    nights:               need.nights.length,
    seasonStart:          requireSeasonBound(p.overnight_permit.season_start, p.name),
    seasonEnd:            requireSeasonBound(p.overnight_permit.season_end, p.name),
    recgov:               p.recgov,
    campfiresAllowed:     p.campfires_allowed,
    bearCanisterRequired: p.bear_canister_required,
    designatedSitesOnly:  p.designated_sites_only,
  })
}

async function buildDetectedPermits(
  tripId: string, toAdd: PermitNeed[], toAddSelfReg: PermitNeed[], partySize: number,
): Promise<{ detected: Permit[]; failures: number }> {
  const detected: Permit[] = toAddSelfReg.map(buildSelfRegisterPermit)
  let failures = 0
  for (const need of toAdd) {
    try {
      const product = await resolveZoneProduct(tripId, need)
      detected.push(buildZonePermit(need, partySize, product))
    } catch {
      failures++
    }
  }
  return { detected, failures }
}

function buildZoneDetectErrorMessage(failures: number): string | null {
  if (failures === 0) return null
  const plural = failures !== 1
  return `Couldn't auto-fill ${failures} zone permit${plural ? 's' : ''} — try Re-detect, or add ${plural ? 'them' : 'it'} manually.`
}

type ZoneDetectionCtx = {
  trip: Trip | undefined
  routeSegments: PlanRouteData['segments'] | undefined
  permits: Permit[]
  partySize: number
  zoneDetectedSignature: string | undefined
  setPermits: Dispatch<SetStateAction<Permit[]>>
  setZoneDetectedSignature: Dispatch<SetStateAction<string | undefined>>
  setZoneDetectedAt: Dispatch<SetStateAction<string | undefined>>
  setZoneDetecting: Dispatch<SetStateAction<boolean>>
  setZoneDetectError: Dispatch<SetStateAction<string | null>>
  zoneDetectingRef: { current: boolean }
  invalidateAiUsage: () => void
}

function resolvableZoneContext(
  trip: Trip | undefined,
  routeSegments: PlanRouteData['segments'] | undefined,
  alreadyRunning: boolean,
): { tripId: string; startDate: string; segments: PlanRouteData['segments'] } | null {
  if (!trip || !trip._id || !trip.startDate || !routeSegments || routeSegments.length < 2 || alreadyRunning) return null
  return { tripId: trip._id, startDate: trip.startDate, segments: routeSegments }
}

// Auto-detect zone-stay permits from route geometry. Re-runs whenever the route's
// camp nights actually change (routeSignature), not just once ever — so editing the
// route after visiting this stage keeps zone permits in sync instead of going stale.
// Geometry decides which zones/nights are ground truth; the AI call only picks the
// recgov product + copy. `force` lets the manual "Re-detect" button retry even when
// the signature hasn't changed (e.g. after a transient AI failure).
async function performZoneDetection(ctx: ZoneDetectionCtx, force: boolean): Promise<void> {
  const { trip, routeSegments, permits, partySize, zoneDetectedSignature, setPermits, setZoneDetectedSignature, setZoneDetectedAt, setZoneDetecting, setZoneDetectError, zoneDetectingRef, invalidateAiUsage } = ctx
  const resolved = resolvableZoneContext(trip, routeSegments, zoneDetectingRef.current)
  if (!resolved) return
  const { tripId, startDate, segments: routeSegs } = resolved
  const signature = routeSignature(routeSegs, startDate)
  if (!force && signature === zoneDetectedSignature) return

  zoneDetectingRef.current = true
  setZoneDetecting(true)
  setZoneDetectError(null)

  try {
    const { needs, selfRegister } = detectZoneStays(routeSegs, startDate)
    const currentNeedIds = new Set([...needs, ...selfRegister].map(zoneNeedId))
    setPermits(prev => pruneStaleZonePermits(prev, currentNeedIds))

    const { toAdd, toAddSelfReg } = reconcileZoneNeeds(needs, selfRegister, permits, currentNeedIds)
    const { detected, failures } = await buildDetectedPermits(tripId, toAdd, toAddSelfReg, partySize)
    if (toAdd.length > 0) invalidateAiUsage()
    if (detected.length > 0) {
      setPermits(prev => [...prev, ...detected.filter(d => !prev.some(p => p.id === d.id))])
    }
    setZoneDetectError(buildZoneDetectErrorMessage(failures))
    setZoneDetectedSignature(signature)
  } catch {
    setZoneDetectError('Zone detection failed — try Re-detect, or add permits manually.')
  } finally {
    setZoneDetecting(false)
    setZoneDetectedAt(new Date().toISOString())
    zoneDetectingRef.current = false
  }
}

export function useZoneDetection(
  trip: Trip | undefined,
  routeSegments: PlanRouteData['segments'] | undefined,
  permits: Permit[],
  setPermits: Dispatch<SetStateAction<Permit[]>>,
  partySize: number,
  setZoneDetectedAt: Dispatch<SetStateAction<string | undefined>>,
  zoneDetectedSignature: string | undefined,
  setZoneDetectedSignature: Dispatch<SetStateAction<string | undefined>>,
) {
  const [zoneDetecting, setZoneDetecting] = useState(false)
  const [zoneDetectError, setZoneDetectError] = useState<string | null>(null)
  const zoneDetectingRef = useRef(false)
  const qc = useQueryClient()

  function runZoneDetection(force = false) {
    return performZoneDetection({
      trip, routeSegments, permits, partySize, zoneDetectedSignature,
      setPermits, setZoneDetectedSignature, setZoneDetectedAt, setZoneDetecting, setZoneDetectError, zoneDetectingRef,
      invalidateAiUsage: () => qc.invalidateQueries({ queryKey: ['ai-usage'] }),
    }, force)
  }

  useEffect(() => {
    // Deferred a tick so the detection's state updates don't fire synchronously
    // within this effect — also means a rapid second dep change here cancels the
    // stale run before it starts, instead of letting it kick off unnecessarily.
    const timer = setTimeout(() => { runZoneDetection() }, 0)
    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip?._id, trip?.startDate, routeSegments])

  return { zoneDetecting, zoneDetectError, runZoneDetection }
}

// ─── Permit dialog + CRUD ────────────────────────────────────────────────────

export function usePermitDialog(permits: Permit[], setPermits: Dispatch<SetStateAction<Permit[]>>) {
  const [freeformOpen, setFreeformOpen] = useState(false)
  const [editingPermit, setEditingPermit] = useState<Permit | undefined>(undefined)
  const [aiPrefill, setAiPrefill] =
    useState<{ confidence: PermitLookupResult['confidence']; verificationNote: string } | undefined>(undefined)

  function closeDialog() {
    setFreeformOpen(false)
    setEditingPermit(undefined)
    setAiPrefill(undefined)
  }

  function openAdd() {
    setEditingPermit(undefined)
    setAiPrefill(undefined)
    setFreeformOpen(true)
  }

  function openEdit(id: string) {
    const permit = permits.find(p => p.id === id)
    if (permit) { setEditingPermit(permit); setAiPrefill(undefined); setFreeformOpen(true) }
  }

  function handleDialogSave(p: Permit) {
    const isExisting = permits.some(existing => existing.id === p.id)
    setPermits(prev => isExisting ? prev.map(existing => existing.id === p.id ? p : existing) : [...prev, p])
    closeDialog()
  }

  return { freeformOpen, editingPermit, aiPrefill, setEditingPermit, setAiPrefill, setFreeformOpen, openAdd, openEdit, handleDialogSave, closeDialog }
}

function buildLookupCriticalDates(permitId: string, criticalDates: PermitLookupResult['criticalDates']): PlanCriticalDate[] {
  return criticalDates
    .filter(d => !!d.dateStr)
    .map((d, i) => ({
      id: `pcd_${permitId}_${i}`,
      dateMs: toDateMs(d.dateStr as string, d.timeStr),
      hasTime: !!d.timeStr,
      label: d.label,
      tone: d.tone,
      source: 'permit' as const,
    }))
}

function buildPrefilledPermit(result: PermitLookupResult, partySize: number): Permit {
  const permitId = `lookup_${Date.now()}`
  return {
    id: permitId, type: result.type, name: result.name, agency: result.agency,
    why: result.why, url: result.url, fields: {}, party: partySize, confidence: result.confidence,
    criticalDates: buildLookupCriticalDates(permitId, result.criticalDates),
  }
}

export function usePermitLookup(
  trip: Trip | undefined,
  links: PermitLink[],
  partySize: number,
  setEditingPermit: Dispatch<SetStateAction<Permit | undefined>>,
  setAiPrefill: Dispatch<SetStateAction<{ confidence: PermitLookupResult['confidence']; verificationNote: string } | undefined>>,
  setFreeformOpen: Dispatch<SetStateAction<boolean>>,
) {
  const [lookupLoading, setLookupLoading] = useState(false)
  const [lookupError, setLookupError] = useState<string | null>(null)
  const qc = useQueryClient()

  async function handleSearch(permitName: string) {
    if (!trip?._id || lookupLoading) return
    setLookupLoading(true)
    setLookupError(null)
    try {
      const result = await lookupPermit(trip._id, permitName, links)
      qc.invalidateQueries({ queryKey: ['ai-usage'] })
      setEditingPermit(buildPrefilledPermit(result, partySize))
      setAiPrefill({ confidence: result.confidence, verificationNote: result.verificationNote })
      setFreeformOpen(true)
    } catch (err) {
      setLookupError(extractApiError(err) ?? 'Lookup failed — try a different name or add manually')
    } finally {
      setLookupLoading(false)
    }
  }

  return { lookupLoading, lookupError, handleSearch }
}

export function computePartySize(trip: Trip | undefined): number {
  return (trip?.sharedWith?.length ?? 0) + 1
}

export function computeLocationLabel(trip: Trip | undefined): string {
  return trip?.location ?? trip?.title ?? ''
}

export function usePermitActions(
  setPermits: Dispatch<SetStateAction<Permit[]>>,
  setCriticalDates: Dispatch<SetStateAction<PlanCriticalDate[]>>,
) {
  function remove(id: string) { setPermits(prev => prev.filter(p => p.id !== id)) }

  function updatePermitField(id: string, key: string, value: string) {
    setPermits(prev => prev.map(p => p.id === id ? { ...p, fields: { ...p.fields, [key]: value } } : p))
  }

  // scanDateId format from extractScanDates: permit__${permitId}__${cdId}
  function removeScanDate(scanDateId: string) {
    const [, permitId, cdId] = scanDateId.split('__')
    if (!permitId || !cdId) return
    setPermits(prev => prev.map(p =>
      p.id !== permitId ? p : { ...p, criticalDates: p.criticalDates?.filter(cd => cd.id !== cdId) ?? [] }
    ))
  }

  function removeCriticalDate(id: string) {
    if (id.startsWith('permit__')) removeScanDate(id)
    else setCriticalDates(prev => prev.filter(d => d.id !== id))
  }

  return { remove, updatePermitField, removeCriticalDate }
}

export function computePermitsChecklist(permits: Permit[], partyConfirmed: boolean, backupPlanned: boolean) {
  const item1 = permits.length > 0
  const item2 = partyConfirmed
  const item3 = backupPlanned
  const doneCount = [item1, item2, item3].filter(Boolean).length
  const progress = Math.round((doneCount / CHECKLIST_TOTAL) * PERCENT_MULTIPLIER)
  return { item1, item2, item3, doneCount, progress }
}

// ─── Top-level aggregator ─────────────────────────────────────────────────────

export function usePermitsStageState(
  plan: PlanData | undefined,
  onChange: ((patch: Partial<PlanData>) => void) | undefined,
  onProgress: ((done: number, total: number) => void) | undefined,
  trip: Trip | undefined,
) {
  const partySize = computePartySize(trip)
  const s = usePermitsPersistedState(plan)
  usePermitsPersist(onChange, s)
  const scanDates = useMemo(() => extractScanDates(s.permits), [s.permits])

  const scan = useScan(trip, s.setLinks, s.lastScanned, s.setLastScanned)
  const zoneDetection = useZoneDetection(
    trip, plan?.route?.segments, s.permits, s.setPermits, partySize,
    s.setZoneDetectedAt, s.zoneDetectedSignature, s.setZoneDetectedSignature,
  )
  const dialog = usePermitDialog(s.permits, s.setPermits)
  const lookup = usePermitLookup(trip, s.links, partySize, dialog.setEditingPermit, dialog.setAiPrefill, dialog.setFreeformOpen)
  const actions = usePermitActions(s.setPermits, s.setCriticalDates)

  const checklist = computePermitsChecklist(s.permits, s.partyConfirmed, s.backupPlanned)
  usePermitsProgress(onProgress, checklist.doneCount, s.permitFree)

  return { partySize, s, scanDates, scan, zoneDetection, dialog, lookup, actions, checklist }
}
