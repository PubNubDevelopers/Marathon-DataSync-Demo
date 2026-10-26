export type LngLat = [number, number]

const R = 6371000

// Great-circle distance in metres.
export function distanceM([lng1, lat1]: LngLat, [lng2, lat2]: LngLat) {
  const toRad = Math.PI / 180
  const dLat = (lat2 - lat1) * toRad
  const dLng = (lng2 - lng1) * toRad
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

export const lerp = (a: LngLat, b: LngLat, t: number): LngLat => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]

// A route with cumulative distances, so the simulator can ask "where is the
// runner after 2.4 km?".
export type Route = { coords: LngLat[]; cumulative: number[]; lengthM: number }

export function toRoute(coords: LngLat[]): Route {
  const cumulative = [0]
  for (let i = 1; i < coords.length; i++) cumulative.push(cumulative[i - 1] + distanceM(coords[i - 1], coords[i]))
  return { coords, cumulative, lengthM: cumulative[cumulative.length - 1] }
}

export function pointAt(route: Route, m: number): LngLat {
  const { coords, cumulative } = route
  if (m <= 0) return coords[0]
  if (m >= route.lengthM) return coords[coords.length - 1]
  let lo = 0
  let hi = cumulative.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (cumulative[mid] <= m) lo = mid
    else hi = mid
  }
  const t = (m - cumulative[lo]) / (cumulative[hi] - cumulative[lo] || 1)
  return lerp(coords[lo], coords[hi], t)
}

export function formatPace(sec: number | null | undefined) {
  if (!sec || !Number.isFinite(sec) || sec <= 0 || sec > 3600) return '–'
  const m = Math.floor(sec / 60)
  const s = Math.round(sec % 60)
  return s === 60 ? `${m + 1}:00` : `${m}:${String(s).padStart(2, '0')}`
}

export function formatKm(km: number | null | undefined) {
  return (km ?? 0).toFixed(2)
}

export function formatClock(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const mm = String(m).padStart(h ? 2 : 1, '0')
  return `${h ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`
}

export function agoLabel(iso: string | undefined, now: number) {
  if (!iso) return ''
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000))
  if (s < 5) return 'just now'
  if (s < 60) return `${s} s ago`
  const m = Math.round(s / 60)
  return m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`
}

// Google's encoded polyline format, precision 5 (about 1 m). It stores latitude
// first. Points here are [lng, lat], like everywhere else in this file.
// https://developers.google.com/maps/documentation/utilities/polylinealgorithm
const PRECISION = 1e5

// Rounds a point to what the encoding keeps, so the runner's own trail and the
// decoded one are the same numbers.
export const roundPoint = ([lng, lat]: LngLat): LngLat => [Math.round(lng * PRECISION) / PRECISION, Math.round(lat * PRECISION) / PRECISION]

function encodeValue(v: number) {
  let n = v < 0 ? ~(v << 1) : v << 1
  let out = ''
  while (n >= 0x20) {
    out += String.fromCharCode((0x20 | (n & 0x1f)) + 63)
    n >>>= 5
  }
  return out + String.fromCharCode(n + 63)
}

export function encodePolyline(points: LngLat[]) {
  let out = ''
  let lat0 = 0
  let lng0 = 0
  for (const [lng, lat] of points) {
    const la = Math.round(lat * PRECISION)
    const ln = Math.round(lng * PRECISION)
    out += encodeValue(la - lat0) + encodeValue(ln - lng0)
    lat0 = la
    lng0 = ln
  }
  return out
}

// Returns no points for anything that isn't a well-formed polyline.
export function decodePolyline(text: string | null | undefined): LngLat[] {
  if (typeof text !== 'string') return []
  const points: LngLat[] = []
  let i = 0
  const next = () => {
    let shift = 0
    let n = 0
    let b: number
    do {
      if (i >= text.length) return null
      b = text.charCodeAt(i++) - 63
      if (b < 0 || b > 63) return null
      n |= (b & 0x1f) << shift
      shift += 5
    } while (b >= 0x20)
    return n & 1 ? ~(n >> 1) : n >> 1
  }
  let lat = 0
  let lng = 0
  while (i < text.length) {
    const dLat = next()
    const dLng = next()
    if (dLat == null || dLng == null) return []
    lat += dLat
    lng += dLng
    points.push([lng / PRECISION, lat / PRECISION])
  }
  return points
}

// Ramer–Douglas–Peucker: drops points that lie within `toleranceM` of the line
// through their neighbours, so a trail keeps its corners in fewer points.
export function simplify(points: LngLat[], toleranceM: number): LngLat[] {
  if (points.length < 3) return points
  const k = Math.cos((points[0][1] * Math.PI) / 180)
  const xy = points.map(([lng, lat]) => [lng * k * 111320, lat * 110540] as const)
  const keep = new Uint8Array(points.length)
  keep[0] = keep[points.length - 1] = 1
  const stack: [number, number][] = [[0, points.length - 1]]
  while (stack.length) {
    const [a, b] = stack.pop()!
    const [ax, ay] = xy[a]
    const [bx, by] = xy[b]
    const dx = bx - ax
    const dy = by - ay
    const len = Math.hypot(dx, dy) || 1
    let far = -1
    let farD = toleranceM
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs(dy * (xy[i][0] - ax) - dx * (xy[i][1] - ay)) / len
      if (d > farD) {
        farD = d
        far = i
      }
    }
    if (far > 0) {
      keep[far] = 1
      stack.push([a, far], [far, b])
    }
  }
  return points.filter((_, i) => keep[i])
}
