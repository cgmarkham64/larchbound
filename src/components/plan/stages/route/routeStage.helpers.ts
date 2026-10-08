import type L from 'leaflet'
import type { LatLngBoundsExpression } from 'leaflet'
import type { CheckRow, RoutePreview, SegRow, WaterEntry, MergedRow, DrawState, ReconnectUpdate } from './routeStage.types'
import type { DrawPhaseFlags } from './routeMapCard.types'
import type { DetectedWaterSource } from '../../../../lib/waterSources'
import type { Waypoint } from '../../../../types'
import { haversineMiles, haversinePathMiles } from '../../../../lib/geo'
import { mToFt, milesToKm, ftToM } from '../../../../lib/units'
import type { UnitSystem } from '../../../../lib/units'
import { getSunTimes, localSolarHHMM } from '../../../../lib/sun'
import { daysToMs, readCachedTTL, writeCachedTTL } from '../../../../lib/localCache'

const ELEV_GAIN_ROUND_TO_FT = 10
const COORD_DISPLAY_DECIMALS = 3
const DEFAULT_SPLIT_RATIO = 0.5
const MINUTES_PER_HOUR = 60
const MINUTES_PER_DAY = 1440
const DEFAULT_MAP_LAT = 40.0
// Place names and terrain elevation don't change — round to ~110m so re-dragging a pin
// near the same spot reuses the cache instead of re-hitting Nominatim/open-elevation.
const GEO_CACHE_COORD_DECIMALS = 3
const GEO_CACHE_TTL_DAYS = 30
const GEO_CACHE_TTL_MS = daysToMs(GEO_CACHE_TTL_DAYS)

function roundedCoordKey(...coords: number[]): string {
  return coords.map(c => c.toFixed(GEO_CACHE_COORD_DECIMALS)).join(',')
}
const DEFAULT_MAP_LON = -105.5
const DEFAULT_MAP_ZOOM = 5
const MAP_FIT_PADDING_PX = 20

export function computeDrawPhaseFlags(drawState: DrawState): DrawPhaseFlags {
  return {
    isDrawing: drawState.phase !== 'idle',
    isPlacingPin: drawState.phase === 'placing-start' || drawState.phase === 'placing-end',
    startPlaced: drawState.phase === 'placing-end' || drawState.phase === 'active',
    endPlaced: drawState.phase === 'active',
  }
}

export function computeMapViewport(bounds: L.LatLngBounds | null) {
  return bounds
    ? { bounds: bounds as LatLngBoundsExpression, boundsOptions: { padding: [MAP_FIT_PADDING_PX, MAP_FIT_PADDING_PX] as [number, number] } }
    : { center: [DEFAULT_MAP_LAT, DEFAULT_MAP_LON] as [number, number], zoom: DEFAULT_MAP_ZOOM }
}

export function computeShowMap(bounds: L.LatLngBounds | null, isDrawing: boolean, segments: SegRow[]): boolean {
  return !!bounds || isDrawing || segments.some(s => s.path?.length)
}

export function fmtMi(mi: number, sys: UnitSystem): string {
  return sys === 'metric' ? `${milesToKm(mi).toFixed(1)} km` : `${mi.toFixed(1)} mi`
}

export function formatRouteStats(segmentCount: number, totalMiles: number, totalGain: number, sys: UnitSystem): string {
  if (segmentCount === 0) return 'No segments added yet'
  const dist = sys === 'metric' ? `${milesToKm(totalMiles).toFixed(1)} km` : `${totalMiles.toFixed(1)} mi`
  const gain = sys === 'metric' ? `${ftToM(totalGain).toLocaleString()} m` : `${totalGain.toLocaleString()} ft`
  return `${dist} · +${gain} gain · ${segmentCount} segment${segmentCount !== 1 ? 's' : ''}`
}

// ─── Draw-mode state transitions ───────────────────────────────────────────────

export function computeEditDrawState(editingSeg: SegRow & { path: [number, number][] }): DrawState {
  const start = editingSeg.path[0]
  const end = editingSeg.path[editingSeg.path.length - 1]
  const hasTimes = !!(editingSeg.wakeTime || editingSeg.onTrailTime || editingSeg.campByTime)
  return {
    phase: 'active', start, end,
    loading: false, result: null, error: null,
    name: editingSeg.name, nameAuto: false, segN: editingSeg.n,
    notes: editingSeg.notes,
    showMore: !!(editingSeg.notes || editingSeg.water || editingSeg.exposure) || !hasTimes,
    sunTimesLoading: !hasTimes,
    water: editingSeg.water,
    exposure: editingSeg.exposure,
    hard: editingSeg.hard,
    wakeTime: editingSeg.wakeTime,
    onTrailTime: editingSeg.onTrailTime,
    campByTime: editingSeg.campByTime,
    editingSeg,
  }
}

export function computeNewSegmentDrawState(segments: SegRow[]): DrawState {
  const prevPath = segments[segments.length - 1]?.path
  const snapPoint = prevPath?.length ? prevPath[prevPath.length - 1] : null
  return snapPoint
    ? { phase: 'placing-end', start: snapPoint, snappedToPrev: true }
    : { phase: 'placing-start' }
}

export function buildActiveDrawStateFromClick(
  drawState: Extract<DrawState, { phase: 'placing-end' }>, segments: SegRow[], lat: number, lng: number,
): Extract<DrawState, { phase: 'active' }> {
  const end: [number, number] = [lat, lng]
  const segN = drawState.editingSeg?.n ?? ((segments[segments.length - 1]?.n ?? 0) + 1)
  return {
    phase: 'active', start: drawState.start, end,
    loading: true, result: null, error: null,
    name: `Segment ${segN}`, nameAuto: true, segN,
    notes: drawState.editingSeg?.notes ?? '',
    showMore: true,
    sunTimesLoading: true,
    water: drawState.editingSeg?.water,
    exposure: drawState.editingSeg?.exposure,
    hard: drawState.editingSeg?.hard,
    wakeTime: undefined,
    onTrailTime: undefined,
    campByTime: undefined,
    editingSeg: drawState.editingSeg,
  }
}

// ─── Segment reconnection (adjacent-segment endpoint sync) ─────────────────────

function nextNeighborUpdate(segments: SegRow[], segIdx: number, newPos: [number, number]): ReconnectUpdate | null {
  const next = segments[segIdx + 1]
  if (!next?.path?.length) return null
  return { si: segIdx + 1, start: newPos, end: next.path[next.path.length - 1] }
}

function prevNeighborUpdate(segments: SegRow[], segIdx: number, newPos: [number, number]): ReconnectUpdate | null {
  const prev = segments[segIdx - 1]
  if (!prev?.path?.length) return null
  return { si: segIdx - 1, start: prev.path[0], end: newPos }
}

function pointsDiffer(a: [number, number] | undefined, b: [number, number]): boolean {
  return !!a && (a[0] !== b[0] || a[1] !== b[1])
}

export function computeEndpointReconnectUpdates(
  segments: SegRow[], segIdx: number, which: 'start' | 'end', newPos: [number, number],
): ReconnectUpdate[] {
  const path = segments[segIdx]?.path
  if (!path?.length) return []

  const selfUpdate: ReconnectUpdate = {
    si: segIdx,
    start: which === 'start' ? newPos : path[0],
    end: which === 'end' ? newPos : path[path.length - 1],
  }
  const neighborUpdate = which === 'end'
    ? nextNeighborUpdate(segments, segIdx, newPos)
    : prevNeighborUpdate(segments, segIdx, newPos)
  return neighborUpdate ? [selfUpdate, neighborUpdate] : [selfUpdate]
}

export function computeEditReconnectUpdates(
  segments: SegRow[], editingSeg: SegRow, newStart: [number, number], newEnd: [number, number],
): ReconnectUpdate[] {
  const segIdx = segments.findIndex(s => s.n === editingSeg.n)
  const endUpdate = pointsDiffer(editingSeg.path?.[editingSeg.path.length - 1], newEnd)
    ? nextNeighborUpdate(segments, segIdx, newEnd)
    : null
  const startUpdate = pointsDiffer(editingSeg.path?.[0], newStart)
    ? prevNeighborUpdate(segments, segIdx, newStart)
    : null
  return [endUpdate, startUpdate].filter((u): u is ReconnectUpdate => u !== null)
}

export function applyReconnectResults(prev: SegRow[], results: { si: number; preview: RoutePreview | null }[]): SegRow[] {
  let next = [...prev]
  for (const { si, preview } of results) {
    if (!preview) continue
    next = next.map((s, i) =>
      i === si ? { ...s, mi: parseFloat(preview.mi.toFixed(1)), gain: preview.gain, path: preview.path } : s
    )
  }
  return next
}

export const DEFAULT_CHECKLIST: CheckRow[] = [
  { text: 'Route picked',                  done: false },
  { text: 'Entry trailhead set',           done: false },
  { text: 'Exit trailhead set',            done: false },
  { text: 'Distance confirmed',            done: false },
  { text: 'Elevation gain confirmed',      done: false },
  { text: 'Segments reviewed',             done: false },
  { text: 'Exposure & water annotated',    done: false, readonly: true },
]

const AMBER = '#f0a030'

export const SEG_COLORS = [AMBER, '#4ade80', '#a78bfa', '#f472b6', '#60a5fa', '#34d399', '#fb923c', '#f87171']

export const EXP_LABEL: Record<string, string> = {
  low:     'Low Exposure',
  med:     'Moderate Exposure',
  high:    'High Exposure',
  extreme: 'Extreme Exposure',
}

export const GRID      = '20px 1fr 60px 72px 72px 40px'
export const DRAG_GRID = '14px 20px 1fr 60px 72px 72px 40px'
export const ACTIVE_BG = 'var(--color-amber-dim)'

export function toLatLngs(coords: [number, number, number][] | undefined): [number, number][] {
  return coords?.map(([lon, lat]) => [lat, lon]) ?? []
}

export function gpxCoordsToMiles(coords: [number, number, number][]): number {
  return haversinePathMiles(coords.map(([lon, lat]) => [lat, lon]))
}

export function buildGpx(coords: [number, number, number][], name: string): string {
  const trkpts = coords.map(([lon, lat, ele]) =>
    `    <trkpt lat="${lat}" lon="${lon}">${ele ? `<ele>${ele}</ele>` : ''}</trkpt>`
  ).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="LarchBound" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>${name}</name>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>`
}

export function downloadGpx(coords: [number, number, number][], name: string) {
  const blob = new Blob([buildGpx(coords, name)], { type: 'application/gpx+xml' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${name.toLowerCase().replace(/\s+/g, '-')}.gpx`
  a.click()
  URL.revokeObjectURL(url)
}

export function closestGpxIdx(coords: [number, number, number][], pin: [number, number]): number {
  let best = 0, bestDist = Infinity
  for (let i = 0; i < coords.length; i++) {
    const dlat = coords[i][1] - pin[0]
    const dlon = coords[i][0] - pin[1]
    const d = dlat * dlat + dlon * dlon
    if (d < bestDist) { bestDist = d; best = i }
  }
  return best
}

function sumElevationGainFt(elevsM: number[]): number {
  let gain = 0
  for (let i = 1; i < elevsM.length; i++) {
    const delta = elevsM[i] - elevsM[i - 1]
    if (delta > 0) gain += mToFt(delta)
  }
  return Math.round(gain / ELEV_GAIN_ROUND_TO_FT) * ELEV_GAIN_ROUND_TO_FT
}

const GPX_PREVIEW_SPARK_SAMPLES = 60

function previewFromGpx(
  gpxCoords: [number, number, number][],
  start: [number, number],
  end: [number, number],
): RoutePreview | null {
  let si = closestGpxIdx(gpxCoords, start)
  let ei = closestGpxIdx(gpxCoords, end)
  if (si === ei) return null
  if (si > ei) [si, ei] = [ei, si]

  const slice = gpxCoords.slice(si, ei + 1)
  const path: [number, number][] = slice.map(([lon, lat]) => [lat, lon])
  const rawElevs = slice.map(([,, ele]) => ele)
  const mi = haversinePathMiles(path)
  const gain = sumElevationGainFt(rawElevs)
  const step = Math.max(1, Math.floor(rawElevs.length / GPX_PREVIEW_SPARK_SAMPLES))
  const sparkElevs = rawElevs.filter((_, i) => i % step === 0 || i === rawElevs.length - 1)
  return { path, mi, gain, sparkElevs }
}

const STRAIGHT_LINE_STEPS = 20

async function fetchElevationLookup(sampled: [number, number][]): Promise<number[]> {
  try {
    const locations = sampled.map(([lat, lng]) => ({ latitude: lat, longitude: lng }))
    const res = await fetch('https://api.open-elevation.com/api/v1/lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locations }),
    })
    const data = await res.json()
    return (data.results as { elevation: number }[]).map(r => r.elevation)
  } catch {
    return []
  }
}

async function previewFromStraightLine(start: [number, number], end: [number, number]): Promise<RoutePreview> {
  const path: [number, number][] = Array.from({ length: STRAIGHT_LINE_STEPS + 1 }, (_, i) => [
    start[0] + (end[0] - start[0]) * (i / STRAIGHT_LINE_STEPS),
    start[1] + (end[1] - start[1]) * (i / STRAIGHT_LINE_STEPS),
  ] as [number, number])
  const mi = haversinePathMiles(path)
  const sampled = path.filter((_, i) => i % 2 === 0 || i === path.length - 1)

  const cacheKey = `larchbound-elev-${roundedCoordKey(...start, ...end)}`
  const cached = readCachedTTL<number[]>(cacheKey, GEO_CACHE_TTL_MS)
  const sparkElevs = cached ?? await fetchElevationLookup(sampled)
  if (!cached && sparkElevs.length > 0) writeCachedTTL(cacheKey, sparkElevs)

  const gain = sparkElevs.length > 0 ? sumElevationGainFt(sparkElevs) : 0
  return { path, mi, gain, sparkElevs }
}

export async function fetchRoutePreview(
  start: [number, number],
  end: [number, number],
  gpxCoords?: [number, number, number][],
): Promise<RoutePreview> {
  const fromGpx = gpxCoords && gpxCoords.length > 1 ? previewFromGpx(gpxCoords, start, end) : null
  return fromGpx ?? previewFromStraightLine(start, end)
}

export function formatCoord([lat, lng]: [number, number]): string {
  return `${Math.abs(lat).toFixed(COORD_DISPLAY_DECIMALS)}°${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lng).toFixed(COORD_DISPLAY_DECIMALS)}°${lng >= 0 ? 'E' : 'W'}`
}

export function snapToRouteMi(lat: number, lon: number, coords: [number, number, number][]): number {
  let best = 0, bestSq = Infinity
  for (let i = 0; i < coords.length; i++) {
    const dlat = coords[i][1] - lat, dlon = coords[i][0] - lon
    const sq = dlat * dlat + dlon * dlon
    if (sq < bestSq) { bestSq = sq; best = i }
  }
  let d = 0
  for (let i = 1; i <= best; i++) {
    const [lon1, lat1] = coords[i - 1]
    const [lon2, lat2] = coords[i]
    d += haversineMiles(lat1, lon1, lat2, lon2)
  }
  return d
}

export function splitSegmentAt(
  seg: SegRow,
  edgeIdx: number,
  splitPoint: [number, number],
): { segA: Omit<SegRow, 'n'>; segB: Omit<SegRow, 'n'> } | null {
  if (!seg.path || edgeIdx < 0 || edgeIdx >= seg.path.length - 1) return null
  const pathA = [...seg.path.slice(0, edgeIdx + 1), splitPoint]
  const pathB = [splitPoint, ...seg.path.slice(edgeIdx + 1)]
  if (pathA.length < 2 || pathB.length < 2) return null
  const miA    = haversinePathMiles(pathA)
  const miB    = haversinePathMiles(pathB)
  const ratio  = (miA + miB) > 0 ? miA / (miA + miB) : DEFAULT_SPLIT_RATIO
  return {
    segA: {
      name: seg.name, mi: parseFloat(miA.toFixed(1)),
      gain: Math.round(seg.gain * ratio), notes: seg.notes,
      path: pathA, water: seg.water, exposure: seg.exposure, hard: seg.hard,
      wakeTime: seg.wakeTime, onTrailTime: seg.onTrailTime, campByTime: seg.campByTime,
    },
    segB: {
      name: seg.name + ' (cont.)', mi: parseFloat(miB.toFixed(1)),
      gain: Math.round(seg.gain * (1 - ratio)), notes: '',
      path: pathB, water: seg.water, exposure: seg.exposure, hard: undefined,
      wakeTime: undefined, onTrailTime: undefined, campByTime: undefined,
    },
  }
}

export function resolveTimePreference(
  pref: { mode: string; anchor?: string; offsetMinutes?: number; staticTime?: string },
  sunriseHHMM: string,
  sunsetHHMM: string,
): string {
  if (pref.mode === 'static') return pref.staticTime ?? sunriseHHMM
  const anchor = pref.anchor === 'sunset' ? sunsetHHMM : sunriseHHMM
  return addMinutesToTime(anchor, pref.offsetMinutes ?? 0)
}

export function addMinutesToTime(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(':').map(Number)
  const total = ((h * MINUTES_PER_HOUR + m + minutes) % MINUTES_PER_DAY + MINUTES_PER_DAY) % MINUTES_PER_DAY
  return `${String(Math.floor(total / MINUTES_PER_HOUR)).padStart(2, '0')}:${String(total % MINUTES_PER_HOUR).padStart(2, '0')}`
}

// Computed locally (no network call) — sunrise/sunset for a lat/lng/date is a pure
// astronomical calculation, not something that needs an API round-trip.
export function fetchSunTimes(
  lat: number,
  lng: number,
  date: string,
): { sunrise: string; sunset: string } | null {
  const { sunrise, sunset, daylightHours } = getSunTimes(lat, lng, new Date(date + 'T12:00:00Z'))
  if (daylightHours === 0) return null // polar night — no meaningful anchor
  return {
    sunrise: localSolarHHMM(sunrise, lng),
    sunset: localSolarHHMM(sunset, lng),
  }
}

export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  const cacheKey = `larchbound-revgeo-${roundedCoordKey(lat, lng)}`
  const cached = readCachedTTL<string>(cacheKey, GEO_CACHE_TTL_MS)
  if (cached !== null) return cached

  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
      { headers: { 'Accept-Language': 'en' } },
    )
    const data = await res.json()
    const name = data.name || data.display_name?.split(',')[0] || ''
    if (name) writeCachedTTL(cacheKey, name)
    return name
  } catch {
    return ''
  }
}

// ─── Merged route + water rows ────────────────────────────────────────────────

const WATER_TYPES = new Set(['lots-of-water', 'some-water', 'no-water'])

function buildWaterEntries(
  detectedWater: DetectedWaterSource[],
  waypoints: Waypoint[] | undefined,
  routeCoords: [number, number, number][] | undefined,
): WaterEntry[] {
  const entries: WaterEntry[] = detectedWater.map(d => ({
    id: d.id, label: d.label, waypointType: d.waypointType,
    distFromStartMi: d.distFromStartMi, snapDistM: d.snapDistM,
    isDetected: true, lat: d.lat, lon: d.lon,
    passIndex: d.passIndex, passCount: d.passCount,
  }))

  if (routeCoords && routeCoords.length >= 2) {
    for (const wp of (waypoints ?? [])) {
      if (!WATER_TYPES.has(wp.type)) continue
      entries.push({
        id: wp.id, label: wp.label || wp.type,
        waypointType: wp.type as WaterEntry['waypointType'],
        distFromStartMi: snapToRouteMi(wp.lat, wp.lon, routeCoords),
        isDetected: false, lat: wp.lat, lon: wp.lon,
        passIndex: 1, passCount: 1,
      })
    }
  }

  return entries.sort((a, b) => a.distFromStartMi - b.distFromStartMi)
}

function computeCampDists(segments: SegRow[]): number[] {
  let cumul = 0
  const dists: number[] = []
  for (const seg of segments) { cumul += seg.mi; dists.push(cumul) }
  return dists
}

function buildStartRow(segments: SegRow[], campDists: number[], waterEntries: WaterEntry[]): MergedRow | null {
  if (segments.length === 0) return null
  const firstWater = waterEntries.find(w => w.waypointType !== 'no-water')
  const thPos = segments[0]?.path?.[0] ?? null
  return {
    kind: 'start',
    toNextCampMi: campDists[0] ?? null,
    toNextWaterMi: firstWater?.distFromStartMi ?? null,
    lat: thPos ? thPos[0] : null,
    lon: thPos ? thPos[1] : null,
  }
}

function buildCampRows(segments: SegRow[], campDists: number[], waterEntries: WaterEntry[]): MergedRow[] {
  return segments.map((seg, i) => {
    const dist     = campDists[i]
    const isFinish = i === segments.length - 1
    const nextDist = campDists[i + 1] ?? null
    const nextWater = waterEntries.find(w => w.distFromStartMi > dist && w.waypointType !== 'no-water')
    const dryLeg   = !isFinish && !waterEntries.some(
      w => w.distFromStartMi > dist && nextDist !== null && w.distFromStartMi < nextDist && w.waypointType !== 'no-water'
    )
    return {
      kind: 'camp', seg, segIdx: i,
      distFromStartMi: dist, isFinish,
      toNextCampMi: nextDist !== null ? nextDist - dist : null,
      toNextWaterMi: nextWater ? nextWater.distFromStartMi - dist : null,
      dryLeg,
    }
  })
}

function buildWaterRows(waterEntries: WaterEntry[]): MergedRow[] {
  return waterEntries.map((entry, i) => {
    const next = waterEntries[i + 1]
    return {
      kind: 'water', entry,
      toNextWaterMi: next ? next.distFromStartMi - entry.distFromStartMi : null,
    }
  })
}

function buildWaypointRows(
  waypoints: Waypoint[] | undefined,
  routeCoords: [number, number, number][] | undefined,
): MergedRow[] {
  if (!routeCoords || routeCoords.length < 2) return []
  return (waypoints ?? [])
    .filter(wp => !WATER_TYPES.has(wp.type))
    .map(wp => ({ kind: 'waypoint' as const, wp, distFromStartMi: snapToRouteMi(wp.lat, wp.lon, routeCoords) }))
}

function rowDist(r: MergedRow): number {
  return r.kind === 'start' ? -Infinity
    : r.kind === 'camp' ? r.distFromStartMi
    : r.kind === 'waypoint' ? r.distFromStartMi
    : r.entry.distFromStartMi
}

function rowRank(r: MergedRow): number {
  return r.kind === 'camp' ? 0 : r.kind === 'waypoint' ? 1 : r.kind === 'water' ? 2 : -1
}

function sortMergedRows(rows: MergedRow[]): MergedRow[] {
  return [...rows].sort((a, b) => {
    const d = rowDist(a) - rowDist(b)
    return d !== 0 ? d : rowRank(a) - rowRank(b)
  })
}

export function buildMergedRows(
  segments: SegRow[],
  detectedWater: DetectedWaterSource[],
  waypoints: Waypoint[] | undefined,
  routeCoords: [number, number, number][] | undefined,
): MergedRow[] {
  const waterEntries = buildWaterEntries(detectedWater, waypoints, routeCoords)
  if (segments.length === 0 && waterEntries.length === 0) return []

  const campDists = computeCampDists(segments)
  const startRow = buildStartRow(segments, campDists, waterEntries)

  const rows: MergedRow[] = [
    ...(startRow ? [startRow] : []),
    ...buildCampRows(segments, campDists, waterEntries),
    ...buildWaterRows(waterEntries),
    ...buildWaypointRows(waypoints, routeCoords),
  ]

  return sortMergedRows(rows)
}