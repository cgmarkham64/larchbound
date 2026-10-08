import type { WaypointType } from '../types'
import { haversineMeters, haversineMiles } from './geo'
import { daysToMs, readCachedTTL, writeCachedTTL } from './localCache'

const OVERPASS_URL     = 'https://overpass-api.de/api/interpreter'
const MAX_SNAP_DIST_M  = 400
const MAX_VERT_DROP_M  = 40       // ~130 ft — sources below this are effectively off a cliff
const CLUSTER_MI       = 0.35     // within 0.35 miles, only the most reliable source shows
// Springs/streams/rivers don't move — this only needs refreshing on the timescale of OSM edits, not user sessions.
const CACHE_TTL_DAYS   = 7
const CACHE_TTL_MS     = daysToMs(CACHE_TTL_DAYS)
const RETRY_DELAY_MS   = 6_000            // wait 6 s before retrying a 429
const HTTP_TOO_MANY_REQUESTS = 429

export type OsmWaterClass = 'spring' | 'stream' | 'river' | 'lake' | 'drinking_water'

export interface DetectedWaterSource {
  id: string
  lat: number
  lon: number
  label: string
  osmClass: OsmWaterClass
  intermittent: boolean
  waypointType: WaypointType
  distFromStartMi: number
  snapDistM: number
  checkDate?: string  // OSM check_date or survey:date tag (YYYY-MM-DD)
  passIndex: number   // 1-based — which time the route passes this point (e.g. 2 = seen again on the way back)
  passCount: number   // total number of times the route passes within snap distance of this point
}

// ─── Cache + fetch helpers ────────────────────────────────────────────────────

function readCache(key: string): DetectedWaterSource[] | null {
  return readCachedTTL<DetectedWaterSource[]>(key, CACHE_TTL_MS)
}

function writeCache(key: string, data: DetectedWaterSource[]): void {
  writeCachedTTL(key, data)
}

async function overpassFetch(query: string): Promise<Response> {
  const opts: RequestInit = {
    method: 'POST',
    body: `data=${encodeURIComponent(query)}`,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  }
  const res = await fetch(OVERPASS_URL, opts)
  if (res.status === HTTP_TOO_MANY_REQUESTS) {
    await new Promise(r => setTimeout(r, RETRY_DELAY_MS))
    return fetch(OVERPASS_URL, opts)
  }
  return res
}

// Projects point P onto segment AB; returns t ∈ [0,1] and nearest point.
function nearestOnSegment(
  pLat: number, pLon: number,
  aLat: number, aLon: number,
  bLat: number, bLon: number,
): { t: number; lat: number; lon: number } {
  const dLat = bLat - aLat
  const dLon = bLon - aLon
  const lenSq = dLat * dLat + dLon * dLon
  if (lenSq === 0) return { t: 0, lat: aLat, lon: aLon }
  const t = Math.max(0, Math.min(1, ((pLat - aLat) * dLat + (pLon - aLon) * dLon) / lenSq))
  return { t, lat: aLat + t * dLat, lon: aLon + t * dLon }
}

function buildCumulDistMi(coords: [number, number, number][]): number[] {
  const d = [0]
  for (let i = 1; i < coords.length; i++) {
    const [lon1, lat1] = coords[i - 1]
    const [lon2, lat2] = coords[i]
    d.push(d[i - 1] + haversineMiles(lat1, lon1, lat2, lon2))
  }
  return d
}

interface RouteSnapMatch {
  distFromStartMi: number
  snapDistM: number
  snapEleM: number
}

// Distance from (lat, lon) to route segment [A, B], plus the RouteSnapMatch if it were the pick.
function segmentSnapMatch(
  lat: number, lon: number,
  aLon: number, aLat: number, aEle: number,
  bLon: number, bLat: number, bEle: number,
  cumulA: number,
): { dist: number; match: RouteSnapMatch } {
  const { t, lat: sLat, lon: sLon } = nearestOnSegment(lat, lon, aLat, aLon, bLat, bLon)
  const dist = haversineMeters(lat, lon, sLat, sLon)
  const segMi = haversineMiles(aLat, aLon, bLat, bLon)
  return {
    dist,
    match: {
      distFromStartMi: cumulA + t * segMi,
      snapDistM: Math.round(dist),
      snapEleM: aEle + t * (bEle - aEle),
    },
  }
}

// Finds every distinct pass the route makes within MAX_SNAP_DIST_M of (lat, lon) — a point
// can be near the track more than once (out-and-back legs, a lollipop's shared stick, a
// loop that briefly overlaps itself), and each pass should surface as its own entry rather
// than only the single closest one. Passes are contiguous runs of in-range coordinate
// segments; the closest point within each run represents that pass.
// coords are [lon, lat, ele] (GPX convention).
function findRoutePasses(
  lat: number,
  lon: number,
  coords: [number, number, number][],
  cumulDistMi: number[],
): RouteSnapMatch[] {
  const passes: RouteSnapMatch[] = []
  let bestRawDist = Infinity
  let best: RouteSnapMatch | null = null

  for (let i = 0; i < coords.length - 1; i++) {
    const [aLon, aLat, aEle] = coords[i]
    const [bLon, bLat, bEle] = coords[i + 1]
    const { dist, match } = segmentSnapMatch(lat, lon, aLon, aLat, aEle, bLon, bLat, bEle, cumulDistMi[i])

    if (dist > MAX_SNAP_DIST_M) {
      if (best) { passes.push(best); best = null; bestRawDist = Infinity }
      continue
    }
    if (dist < bestRawDist) { bestRawDist = dist; best = match }
  }
  if (best) passes.push(best)

  return passes
}

// ─── Elevation lookup ─────────────────────────────────────────────────────────

// Batch-queries Open-Meteo for ground elevation at each point.
// Returns 0 for any point if the request fails (caller skips vert filter on 0).
async function fetchElevations(points: { lat: number; lon: number }[]): Promise<number[]> {
  if (points.length === 0) return []
  const lats = points.map(p => p.lat).join(',')
  const lons = points.map(p => p.lon).join(',')
  try {
    const res = await fetch(
      `https://api.open-meteo.com/v1/elevation?latitude=${lats}&longitude=${lons}`
    )
    if (!res.ok) return points.map(() => 0)
    const data: { elevation: (number | null)[] } = await res.json()
    return data.elevation.map(e => e ?? 0)
  } catch {
    return points.map(() => 0)
  }
}

// ─── Clustering ───────────────────────────────────────────────────────────────

// Within CLUSTER_MI along the route, keep only the most reliable source.
// A source that has no competitors within that window is always kept.
// no-water sources are exempt — they're hazard warnings, not water.
function deduplicateWaterSources(sources: DetectedWaterSource[]): DetectedWaterSource[] {
  const rank = (t: WaypointType): number =>
    t === 'lots-of-water' ? 2 : t === 'some-water' ? 1 : 0

  return sources.filter(src => {
    if (src.waypointType === 'no-water') return true
    return !sources.some(other => {
      if (other.id === src.id) return false
      if (Math.abs(other.distFromStartMi - src.distFromStartMi) > CLUSTER_MI) return false
      const ro = rank(other.waypointType), rs = rank(src.waypointType)
      if (ro !== rs) return ro > rs
      // Equal rank: prefer closer to trail, then stable id tiebreak
      return other.snapDistM < src.snapDistM ||
        (other.snapDistM === src.snapDistM && other.id < src.id)
    })
  })
}

// ─── Classification ───────────────────────────────────────────────────────────

function classifyType(tags: Record<string, string>, osmClass: OsmWaterClass): WaypointType {
  if (tags.access === 'no' || tags['disused:natural'] === 'spring') return 'no-water'
  if (tags.intermittent === 'yes' || tags.seasonal === 'yes') return 'some-water'
  if (osmClass === 'drinking_water') return 'lots-of-water'
  return 'lots-of-water'
}

function osmLabel(tags: Record<string, string>, osmClass: OsmWaterClass): string {
  if (tags.name) return tags.name
  const defaults: Record<OsmWaterClass, string> = {
    spring: 'Spring',
    stream: 'Stream',
    river: 'River',
    lake: 'Lake',
    drinking_water: 'Drinking Water',
  }
  return defaults[osmClass]
}

// ─── Overpass query + response parsing ─────────────────────────────────────────

const BBOX_PAD_DEG = 0.01

interface OverpassElement {
  type: 'node' | 'way'
  id: number
  lat?: number
  lon?: number
  center?: { lat: number; lon: number }
  tags?: Record<string, string>
}

interface OverpassResponse {
  elements: OverpassElement[]
}

type Candidate = DetectedWaterSource & { snapEleM: number }

function computeBbox(routeCoords: [number, number, number][]): string {
  const lats = routeCoords.map(c => c[1])
  const lons = routeCoords.map(c => c[0])
  const south = Math.min(...lats) - BBOX_PAD_DEG
  const west  = Math.min(...lons) - BBOX_PAD_DEG
  const north = Math.max(...lats) + BBOX_PAD_DEG
  const east  = Math.max(...lons) + BBOX_PAD_DEG
  return `${south},${west},${north},${east}`
}

function buildOverpassQuery(bbox: string): string {
  return `[out:json][timeout:25];
(
  node["natural"="spring"](${bbox});
  node["amenity"="drinking_water"](${bbox});
  way["waterway"="stream"](${bbox});
  way["waterway"="river"](${bbox});
);
out center;`
}

function classifyOsmElement(tags: Record<string, string>): OsmWaterClass | null {
  if (tags.natural === 'spring') return 'spring'
  if (tags.amenity === 'drinking_water') return 'drinking_water'
  if (tags.waterway === 'stream') return 'stream'
  if (tags.waterway === 'river') return 'river'
  return null
}

function buildCandidate(
  el: OverpassElement,
  lat: number,
  lon: number,
  osmClass: OsmWaterClass,
  snap: RouteSnapMatch,
  passIndex: number,
  passCount: number,
): Candidate {
  const tags = el.tags ?? {}
  const baseId = `osm-${el.type}-${el.id}`
  return {
    id: passCount > 1 ? `${baseId}-pass${passIndex}` : baseId,
    lat,
    lon,
    label: osmLabel(tags, osmClass),
    osmClass,
    intermittent: tags.intermittent === 'yes' || tags.seasonal === 'yes',
    waypointType: classifyType(tags, osmClass),
    distFromStartMi: snap.distFromStartMi,
    snapDistM: snap.snapDistM,
    snapEleM: snap.snapEleM,
    checkDate: tags['check_date'] ?? tags['survey:date'],
    passIndex,
    passCount,
  }
}

function resolveLatLon(el: OverpassElement): { lat: number; lon: number } | null {
  const lat = el.lat ?? el.center?.lat
  const lon = el.lon ?? el.center?.lon
  if (lat == null || lon == null) return null
  return { lat, lon }
}

function extractCandidates(
  elements: OverpassElement[],
  routeCoords: [number, number, number][],
  cumulDistMi: number[],
): Candidate[] {
  const seen = new Set<string>()
  const candidates: Candidate[] = []

  for (const el of elements) {
    const point = resolveLatLon(el)
    if (!point) continue

    const osmClass = classifyOsmElement(el.tags ?? {})
    if (!osmClass) continue

    const key = `${el.type}-${el.id}`
    if (seen.has(key)) continue
    seen.add(key)

    const passes = findRoutePasses(point.lat, point.lon, routeCoords, cumulDistMi)
    passes.forEach((snap, i) => {
      candidates.push(buildCandidate(el, point.lat, point.lon, osmClass, snap, i + 1, passes.length))
    })
  }

  return candidates
}

// Apply vertical drop filter when the GPX has elevation data.
// srcEle === 0 means the elevation lookup failed — skip the vert filter for that source.
async function filterByElevationDrop(
  candidates: Candidate[],
  routeHasElevation: boolean,
): Promise<Candidate[]> {
  if (!routeHasElevation || candidates.length === 0) return candidates

  const sourceElevations = await fetchElevations(candidates.map(c => ({ lat: c.lat, lon: c.lon })))
  return candidates.filter((c, i) => {
    const srcEle = sourceElevations[i]
    if (srcEle === 0) return true
    return c.snapEleM - srcEle <= MAX_VERT_DROP_M
  })
}

// ─── Public API ───────────────────────────────────────────────────────────────

// routeCoords: [lon, lat, ele] (GPX convention)
export async function fetchDetectedWaterSources(
  routeCoords: [number, number, number][],
): Promise<DetectedWaterSource[]> {
  if (routeCoords.length < 2) return []

  const bbox = computeBbox(routeCoords)
  const cacheKey = `larchbound-water-${bbox}`
  const cached = readCache(cacheKey)
  if (cached) return cached

  const resp = await overpassFetch(buildOverpassQuery(bbox))
  if (!resp.ok) throw new Error(`Overpass API returned ${resp.status}`)
  const data = await resp.json() as OverpassResponse

  // Check whether the GPX has real elevation data (non-zero on at least one point).
  const routeHasElevation = routeCoords.some(c => c[2] !== 0)
  const cumulDistMi = buildCumulDistMi(routeCoords)
  const candidates = extractCandidates(data.elements, routeCoords, cumulDistMi)

  const results = await filterByElevationDrop(candidates, routeHasElevation)
  results.sort((a, b) => a.distFromStartMi - b.distFromStartMi)
  const final = deduplicateWaterSources(results)
  writeCache(cacheKey, final)
  return final
}