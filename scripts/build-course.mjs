// Builds the Riverside Marathon course: a fictional 42.195 km loop on real streets,
// routed on OpenStreetMap data. Writes data/course.json, data/COURSE.md and
// data/course-preview.png.
//
//   node scripts/build-course.mjs              build (network only on cache miss)
//   node scripts/build-course.mjs --no-preview skip the PNG
//   node scripts/build-course.mjs --route-only route + loop length only (for tuning waypoints)
//
// Every HTTP response (OSRM routes, Overpass queries) is cached in
// scripts/.course-cache/, so a rebuild with unchanged waypoints makes no requests.
// Route data: OpenStreetMap contributors (ODbL), routed with routing.openstreetmap.de.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CACHE = join(ROOT, 'scripts', '.course-cache')
const OUT_JSON = join(ROOT, 'data', 'course.json')
const OUT_PNG = join(ROOT, 'data', 'course-preview.png')
const OUT_MD = join(ROOT, 'data', 'COURSE.md')
const UA = 'riverside-marathon-course-builder/1.0 (demo app course generator)'

const MARATHON_M = 42195
const STEP_M = 25
const MAX_LOOP_GAP_M = 300
const BRIDGE_WINDOW_KM = [22.5, 25.5]
const BRIDGE_PREFERRED = /Świętokrzyski/ // the underpass we designed for; any bridge in the window passes
const START_TARGET = [52.2395, 21.0455] // stadium area, east bank

// Waypoints, in running order. `leg` is how the leg that leaves the waypoint is drawn:
//   'foot' (default)  OSRM foot profile: city streets, no one-way problems.
//   'car'             OSRM car profile: stays on the carriageway of big roads and
//                     interchanges instead of hopping between sidewalks and underpasses.
//   'direct'          a straight piece to the next waypoint, hand-placed on a real road
//                     where both routers refuse a turn a closed-road race makes.
// `bearing` [deg, range] makes OSRM snap the waypoint to the carriageway going that way.
// The last waypoint overshoots the start; the line is cut at exactly 42.195 km.
// Street names are for humans reading this file only; the app never shows them.
const WAYPOINTS = [
  { lat: 52.2385, lng: 21.0428, note: 'Start: Wybrzeże Szczecińskie, west of the stadium, heading north' },
  { lat: 52.2522, lng: 21.0232, note: 'Wybrzeże Helskie, east bank riverside' },
  { lat: 52.2543, lng: 21.0240, note: 'Ratuszowa, round the zoo' },
  { lat: 52.2583, lng: 21.0269, note: 'Jagiellońska, north (car profile from here: stays on the carriageway)', leg: 'car', bearing: [335, 40] },
  { lat: 52.2802, lng: 21.0109, note: 'Jagiellońska, north', leg: 'car', bearing: [335, 40] },
  { lat: 52.3068, lng: 20.9510, note: 'Most Marii Skłodowskiej-Curie, crossing to the west bank', leg: 'car', bearing: [235, 40] },
  { lat: 52.30245, lng: 20.94220, note: 'Aleja Marii Wittek, straight on off the bridge (south-west carriageway)', leg: 'direct', bearing: [235, 40] },
  { lat: 52.30102, lng: 20.93909, note: 'Junction with Marymoncka: left turn drawn by hand (both carriageway centrelines extended to where they meet)', leg: 'direct' },
  { lat: 52.29977, lng: 20.94053, note: 'Marymoncka, south-east (car: keeps to the road, not the forest path beside it)', leg: 'car', bearing: [150, 45] },
  { lat: 52.2940, lng: 20.9463, note: 'Marymoncka, south-east through the forest', leg: 'car', bearing: [150, 45] },
  { lat: 52.2827, lng: 20.9567, note: 'Marymoncka', bearing: [150, 45] },
  { lat: 52.2719, lng: 20.9712, note: 'Słowackiego, east' },
  { lat: 52.2702, lng: 20.9911, note: 'Krasińskiego, east back to the river' },
  { lat: 52.27091, lng: 20.99569, note: 'Krasińskiego at the riverside road: right turn drawn by hand', leg: 'direct' },
  { lat: 52.26986, lng: 20.99837, note: 'Wybrzeże Gdyńskie, riverside, south' },
  { lat: 52.2427, lng: 21.0293, note: 'Riverside boulevard (Bulwary Wiślane), west bank' },
  { lat: 52.2390, lng: 21.0340, note: 'Riverside boulevard, past the bridge underpasses' },
  { lat: 52.2343, lng: 21.0388, note: 'Riverside boulevard just past the last bridge' },
  { lat: 52.2299, lng: 21.0263, note: 'Książęca, the climb up the escarpment' },
  { lat: 52.2259, lng: 21.0236, note: 'Aleje Ujazdowskie, south' },
  { lat: 52.2198, lng: 21.0210, note: 'Aleja Wyzwolenia, west to Plac Zbawiciela' },
  { lat: 52.2165, lng: 21.0198, note: 'Marszałkowska, south to Plac Unii Lubelskiej' },
  { lat: 52.2060, lng: 21.0228, note: 'Puławska, south' },
  { lat: 52.1999, lng: 21.0240, note: 'Puławska at Dolna' },
  { lat: 52.2003, lng: 21.0287, note: 'Dolna, east down the escarpment' },
  { lat: 52.2008, lng: 21.0366, note: 'Jana III Sobieskiego, south' },
  { lat: 52.1970, lng: 21.0395, note: 'Jana III Sobieskiego' },
  { lat: 52.1923, lng: 21.0444, note: 'Jana III Sobieskiego, south' },
  { lat: 52.1923, lng: 21.0486, note: 'Ludwika Idzikowskiego, east' },
  { lat: 52.1950, lng: 21.0548, note: 'Czerniakowska, north to Rondo Nehru' },
  { lat: 52.1991, lng: 21.0542, note: 'Aleja Józefa Becka, east towards the river', leg: 'car', bearing: [60, 45] },
  { lat: 52.2036, lng: 21.0742, note: 'Aleja Józefa Becka', leg: 'car', bearing: [55, 45] },
  { lat: 52.2212, lng: 21.0824, note: 'Wał Miedzeszyński after the crossing back to the east bank, riverside, north-west', leg: 'car', bearing: [280, 40] },
  { lat: 52.2230, lng: 21.0608, note: 'Wał Miedzeszyński', leg: 'car', bearing: [300, 45] },
  { lat: 52.2331, lng: 21.0483, note: 'Wał Miedzeszyński, finish straight', leg: 'car', bearing: [320, 45] },
  { lat: 52.2420, lng: 21.0390, note: 'Overshoot past the start on Wybrzeże Szczecińskie; the course is trimmed to 42.195 km before here', bearing: [325, 45] },
]

// ---------- geometry ----------
const R = 6371008.8
const rad = (d) => (d * Math.PI) / 180
function hav([la1, lo1], [la2, lo2]) {
  const a = Math.sin(rad(la2 - la1) / 2) ** 2 + Math.cos(rad(la1)) * Math.cos(rad(la2)) * Math.sin(rad(lo2 - lo1) / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)))
}
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
function bearingDeg(a, b) {
  const y = Math.sin(rad(b[1] - a[1])) * Math.cos(rad(b[0]))
  const x = Math.cos(rad(a[0])) * Math.sin(rad(b[0])) - Math.sin(rad(a[0])) * Math.cos(rad(b[0])) * Math.cos(rad(b[1] - a[1]))
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}
// Local planar coordinates in metres around a reference latitude (for intersections).
const toXY = ([la, lo], la0) => [rad(lo) * R * Math.cos(rad(la0)), rad(la) * R]
function segIntersect(p1, p2, q1, q2) {
  const d = (p2[0] - p1[0]) * (q2[1] - q1[1]) - (p2[1] - p1[1]) * (q2[0] - q1[0])
  if (Math.abs(d) < 1e-9) return null
  const t = ((q1[0] - p1[0]) * (q2[1] - q1[1]) - (q1[1] - p1[1]) * (q2[0] - q1[0])) / d
  const u = ((q1[0] - p1[0]) * (p2[1] - p1[1]) - (q1[1] - p1[1]) * (p2[0] - p1[0])) / d
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? { t, u } : null
}

// ---------- cached HTTP ----------
mkdirSync(CACHE, { recursive: true })
let lastNet = 0
async function cachedFetch(kind, url, init) {
  const key = createHash('sha1').update(url + (init?.body ?? '')).digest('hex').slice(0, 16)
  const file = join(CACHE, `${kind}-${key}.json`)
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'))
  for (let attempt = 0, wait = 5000; ; attempt++, wait *= 2) {
    const since = Date.now() - lastNet
    if (since < 1000) await new Promise((r) => setTimeout(r, 1000 - since))
    lastNet = Date.now()
    console.log(`  fetch ${kind}${attempt ? ` (retry ${attempt})` : ''}`)
    const res = await fetch(url, { ...init, headers: { 'User-Agent': UA, ...(init?.headers ?? {}) } })
    const text = await res.text()
    if (res.ok && text.trimStart().startsWith('{')) {
      writeFileSync(file, text)
      return JSON.parse(text)
    }
    if (attempt >= 4) throw new Error(`${kind} failed: HTTP ${res.status} ${text.slice(0, 200)}`)
    console.log(`  ${kind} HTTP ${res.status}, waiting ${wait / 1000}s`)
    await new Promise((r) => setTimeout(r, wait))
  }
}

async function route(profile, wps) {
  const coords = wps.map((w) => `${w.lng},${w.lat}`).join(';')
  const service = profile === 'car' ? 'driving' : 'foot'
  let url = `https://routing.openstreetmap.de/routed-${profile}/route/v1/${service}/${coords}?overview=full&geometries=geojson`
  if (wps.some((w) => w.bearing)) url += `&bearings=${wps.map((w) => (w.bearing ? w.bearing.join(',') : '')).join(';')}`
  const j = await cachedFetch(`osrm-${profile}`, url)
  if (j.code !== 'Ok') throw new Error(`OSRM ${profile}: ${j.code} ${j.message ?? ''}`)
  return j
}

const overpass = (query) =>
  cachedFetch('overpass', 'https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'data=' + encodeURIComponent(query),
  })

// Where line B (starting near the end of A) gets closest to A's last 150 m.
// Returns how many vertices of A to keep, the projected point on A, and B's first vertex to use.
function splice(A, B) {
  const la0 = A.at(-1)[0]
  let tailStart = A.length - 1
  for (let d = 0; tailStart > 0 && d < 150; tailStart--) d += hav(A[tailStart - 1], A[tailStart])
  let best = { d: Infinity }
  for (let j = 0, dB = 0; j < B.length && dB < 150; j++) {
    if (j) dB += hav(B[j - 1], B[j])
    const q = toXY(B[j], la0)
    for (let i = tailStart; i < A.length - 1; i++) {
      const a = toXY(A[i], la0), b = toXY(A[i + 1], la0)
      const vx = b[0] - a[0], vy = b[1] - a[1]
      const t = Math.max(0, Math.min(1, ((q[0] - a[0]) * vx + (q[1] - a[1]) * vy) / (vx * vx + vy * vy || 1)))
      const d = Math.hypot(a[0] + vx * t - q[0], a[1] + vy * t - q[1])
      if (d < best.d - 0.5) best = { d, keep: i + 1, at: lerp(A[i], A[i + 1], t), from: j }
    }
  }
  return best
}

// ---------- route the waypoints ----------
console.log('Routing', WAYPOINTS.length, 'waypoints')
const groups = [] // consecutive legs that share a profile become one OSRM request
for (let i = 0; i < WAYPOINTS.length - 1; i++) {
  const p = WAYPOINTS[i].leg ?? 'foot'
  const g = groups.at(-1)
  if (g && g.profile === p) g.to = i + 1
  else groups.push({ profile: p, from: i, to: i + 1 })
}
let raw = []
const legLog = []
for (const g of groups) {
  const wps = WAYPOINTS.slice(g.from, g.to + 1)
  if (g.profile === 'direct') {
    // Hand-placed straight pieces along a real road where both routers refuse the
    // move a closed-road race makes (a left turn the car profile forbids on a road
    // the foot profile may not use). Kept short and documented in data/COURSE.md.
    raw.push(...wps.map((w) => [w.lat, w.lng]))
    wps.slice(0, -1).forEach((w, k) => legLog.push({ i: g.from + k, profile: 'direct', snap: 0, name: '', leg: hav([w.lat, w.lng], [wps[k + 1].lat, wps[k + 1].lng]) }))
    continue
  }
  const j = await route(g.profile, wps)
  const line = j.routes[0].geometry.coordinates.map(([lo, la]) => [la, lo])
  if (raw.length) {
    // Foot and car snap the same waypoint to different sides of the road; splice the
    // two lines where they come closest so the join has no little zig or stub.
    const cut = splice(raw, line)
    raw.length = cut.keep
    raw.push(cut.at)
    line.splice(0, cut.from)
    const gap = hav(raw.at(-1), line[0])
    if (gap > 40) console.warn(`  WARN: ${Math.round(gap)} m jump between route groups at waypoint ${g.from}`)
  }
  raw.push(...line)
  j.waypoints.forEach((w, k) => {
    if (k < wps.length - 1 || g.to === WAYPOINTS.length - 1)
      legLog.push({ i: g.from + k, profile: g.profile, snap: Math.round(w.distance), name: w.name, leg: j.routes[0].legs[k]?.distance })
  })
}
const lineLen = (ps) => ps.reduce((s, p, i) => (i ? s + hav(ps[i - 1], p) : 0), 0)
const routedLen = lineLen(raw)
// Drop duplicate consecutive vertices.
raw = raw.filter((p, i) => i === 0 || hav(p, raw[i - 1]) > 0.05)
// Remove out-and-back stubs (up to ~75 m each way) that routers leave where a waypoint
// snaps to the far side of a road: the line returns within 10 m of where it left.
let stubM = 0 // metres removed as stubs
for (let i = 0; i < raw.length - 2; i++) {
  for (let j = i + 2, run = hav(raw[i], raw[i + 1]); j < raw.length && run <= 150; j++) {
    run += hav(raw[j - 1], raw[j])
    const gap = hav(raw[i], raw[j])
    if (gap < 10 && run > 3 * gap + 20) {
      if (process.env.DEBUG_STUBS) console.log(`  stub ${run.toFixed(0)} m at ${raw[i + 1].map((v) => v.toFixed(5))}`)
      stubM += run - gap
      raw.splice(i + 1, j - i - 1)
      i = Math.max(-1, i - 2)
      break
    }
  }
}
// ---------- resample: divider walk, every point exactly 25 m (haversine) from the previous ----------
// Walks the routed line with a divider: every new point lies on the line exactly `step`
// metres (haversine chord) from the previous one, so the published polyline measures
// exactly step x n. Chords also iron out the sidewalk-to-sidewalk jitter of foot routing,
// which is why the routed line is longer than the course it describes.
// `snap(prev, exact, want)` may replace each new point (used to publish 6-decimal
// coordinates without letting the rounding accumulate); it returns { q, d }.
function divide(line, step, total = Infinity, snap = null) {
  const pts = [line[0]]
  let seg = 0, t = 0, acc = 0
  let cur = line[0]
  // Stop within 5 cm of the total: snapped steps can't land closer than a few millimetres.
  while (total - acc > 0.05) {
    const want = Math.min(pts.length * step, total) - acc
    // First position past (seg, t) whose chord distance from `cur` reaches `want`.
    let found = null
    for (let s = seg; s < line.length - 1; s++) {
      if (hav(cur, line[s + 1]) >= want) {
        let lo = s === seg ? t : 0, hi = 1
        for (let k = 0; k < 60; k++) {
          const mid = (lo + hi) / 2
          if (hav(cur, lerp(line[s], line[s + 1], mid)) < want) lo = mid
          else hi = mid
        }
        found = { s, t: hi }
        break
      }
    }
    if (!found) break
    seg = found.s; t = found.t
    let next = lerp(line[seg], line[seg + 1], t), d = want
    if (snap) ({ q: next, d } = snap(cur, next, want))
    cur = next
    pts.push(cur)
    acc += d
  }
  return { pts, length: acc }
}
const rawLen = lineLen(raw)
// Loop length on the 25 m polyline: distance to where it comes back closest to the start.
const walk = divide(raw, STEP_M)
const loop = (() => { let best = { d: Infinity, at: 0 }; walk.pts.forEach((p, i) => { if (i * STEP_M > 30000) { const d = hav(p, walk.pts[0]); if (d < best.d) best = { d, at: i * STEP_M } } }); return best })()
console.log(`Routed polyline: ${raw.length} vertices, ${(rawLen / 1000).toFixed(3)} km incl. overshoot (${stubM.toFixed(0)} m of out-and-back stubs removed of ${(routedLen / 1000).toFixed(3)} km routed), ${(walk.length / 1000).toFixed(3)} km as 25 m chords`)
console.log(`Loop: back at the start (within ${loop.d.toFixed(0)} m) after ${(loop.at / 1000).toFixed(3)} km of 25 m chords -> the 42.195 km finish lands ${Math.abs(loop.at - MARATHON_M).toFixed(0)} m ${loop.at > MARATHON_M ? 'short of' : 'past'} the start`)
if (process.argv.includes('--route-only')) {
  // Iteration aid: leg table + raw line for inspection, no Overpass, no outputs in data/.
  let acc = 0
  for (const l of legLog) {
    console.log(`  ${String(l.i).padStart(2)} ${l.profile.padEnd(4)} snap ${String(l.snap).padStart(3)} m  km ${(acc / 1000).toFixed(2).padStart(6)}  ${l.name || '-'}`)
    acc += l.leg ?? 0
  }
  writeFileSync(join(CACHE, 'route-raw.json'), JSON.stringify({ points: raw, marks: WAYPOINTS.map((w, i) => ({ lat: w.lat, lng: w.lng, t: String(i) })) }))
  process.exit(0)
}
// Publish with 6 decimals (~0.1 m): each new point is the 6-decimal grid point next to
// the exact one whose chord from the previous published point is closest to what keeps
// the running total on i x 25 m. Rounding never accumulates: every km value is a
// multiple of 0.025 and the polyline measures 42.195 km to the centimetre.
const snap6 = (prev, exact, want) => {
  const g = exact.map((v) => Math.round(v * 1e6))
  let best = { err: Infinity }
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const q = [(g[0] + dy) / 1e6, (g[1] + dx) / 1e6]
    const d = hav(prev, q)
    const err = Math.abs(d - want) + 0.002 * hav(q, exact) // tie-break: stay on the line
    if (err < best.err) best = { err, q, d }
  }
  return best
}
const cut = divide(raw, STEP_M, MARATHON_M, snap6)
if (cut.length < MARATHON_M - 0.5) throw new Error(`Routed line is too short: ${(cut.length / 1000).toFixed(3)} km as 25 m chords. Move the overshoot waypoint further.`)
cut.pts[0] = cut.pts[0].map((v) => +v.toFixed(6))
const points = cut.pts
const km = []
{
  let acc = 0
  points.forEach((p, i) => { if (i) acc += hav(points[i - 1], p); km.push(+(acc / 1000).toFixed(4)) })
}
const totalM = points.reduce((s, p, i) => (i ? s + hav(points[i - 1], p) : 0), 0)
const at = (k) => {
  // Interpolate the polyline at km k.
  let i = km.findIndex((x) => x >= k)
  if (i <= 0) return points[Math.max(0, i)]
  const t = (k - km[i - 1]) / (km[i] - km[i - 1])
  return lerp(points[i - 1], points[i], t).map((v) => +v.toFixed(6))
}

// ---------- checks ----------
const start = points[0], finish = points.at(-1)
const loopGap = hav(start, finish)
const startToTarget = hav(start, START_TARGET)
const lats = points.map((p) => p[0]), lngs = points.map((p) => p[1])
const bounds = [[Math.min(...lats), Math.min(...lngs)], [Math.max(...lats), Math.max(...lngs)]]
const midLat = (bounds[0][0] + bounds[1][0]) / 2
const nsKm = hav([bounds[0][0], bounds[0][1]], [bounds[1][0], bounds[0][1]]) / 1000
const ewKm = hav([midLat, bounds[0][1]], [midLat, bounds[1][1]]) / 1000

// Sharp reversals on the 25 m polyline (a marathon course should have none tighter than a hairpin at a turnaround).
const spikes = []
for (let i = 1; i < points.length - 1; i++) {
  const d = Math.abs(((bearingDeg(points[i], points[i + 1]) - bearingDeg(points[i - 1], points[i]) + 540) % 360) - 180)
  if (d > 135) spikes.push({ km: km[i], turn: Math.round(d), at: points[i] })
}
// Back-and-forth: the course coming back within 12 m of where it was 100 m to 1.5 km earlier.
const doubles = []
for (let i = 0; i < points.length; i += 2) {
  for (let j = i + 4; j < points.length && km[j] - km[i] <= 1.5; j++) {
    if (hav(points[i], points[j]) < 12) { doubles.push({ km: km[i], back: km[j] }); i = j; break }
  }
}

// Finish straight: how straight the last 1.5 km is (chord, and the widest the course
// strays from the chord line).
const straight = (() => {
  const i0 = km.findIndex((k) => k >= MARATHON_M / 1000 - 1.5)
  const a = toXY(points[i0], midLat), b = toXY(finish, midLat)
  const L = Math.hypot(b[0] - a[0], b[1] - a[1])
  let dev = 0
  for (let i = i0; i < points.length; i++) {
    const q = toXY(points[i], midLat)
    dev = Math.max(dev, Math.abs((b[0] - a[0]) * (a[1] - q[1]) - (a[0] - q[0]) * (b[1] - a[1])) / L)
  }
  return { fromKm: km[i0], chord: L, dev, bearing: bearingDeg(points[i0], finish) }
})()

// ---------- bridge crossing evidence (Overpass) ----------
const winIdx = km.map((k, i) => (k >= BRIDGE_WINDOW_KM[0] && k <= BRIDGE_WINDOW_KM[1] ? i : -1)).filter((i) => i >= 0)
const win = winIdx.map((i) => points[i])
// Snap the query box outwards to a 0.01° grid so small waypoint tweaks reuse the cached answer.
const fl = (v) => (Math.floor(v * 100) / 100).toFixed(2), ce = (v) => (Math.ceil(v * 100) / 100).toFixed(2)
const wb = [fl(Math.min(...win.map((p) => p[0]))), fl(Math.min(...win.map((p) => p[1]))), ce(Math.max(...win.map((p) => p[0]))), ce(Math.max(...win.map((p) => p[1])))]
const bridgeData = await overpass(`[out:json][timeout:60];
(
  way["bridge"]["bridge"!="no"]["highway"](${wb.join(',')});
  way["bridge"]["bridge"!="no"]["railway"](${wb.join(',')});
);
out tags geom;`)
const crossings = []
for (const w of bridgeData.elements) {
  if (!w.geometry) continue
  const g = w.geometry.map((n) => [n.lat, n.lon])
  for (let a = 0; a < winIdx.length - 1; a++) {
    const i = winIdx[a]
    const p1 = toXY(points[i], midLat), p2 = toXY(points[i + 1], midLat)
    for (let b = 0; b < g.length - 1; b++) {
      const hit = segIntersect(p1, p2, toXY(g[b], midLat), toXY(g[b + 1], midLat))
      if (!hit) continue
      const pt = lerp(points[i], points[i + 1], hit.t)
      crossings.push({
        wayId: w.id, name: w.tags.name ?? null, kind: w.tags.highway ? `highway=${w.tags.highway}` : `railway=${w.tags.railway}`,
        bridge: w.tags.bridge, layer: w.tags.layer ?? null, structure: w.tags['bridge:structure'] ?? null,
        km: +(km[i] + hav(points[i], pt) / 1000).toFixed(4), lat: +pt[0].toFixed(6), lng: +pt[1].toFixed(6),
      })
    }
  }
}
crossings.sort((a, b) => a.km - b.km)
// The landmark is the preferred named bridge's main carriageway (median of its road
// crossings); any named road bridge in the window is the fallback.
const ROAD = /^highway=(motorway|trunk|primary|secondary|tertiary|unclassified|residential)$/
const pick = (test) => { const c = crossings.filter((x) => x.name && test(x.name) && ROAD.test(x.kind)); return c.length ? c[Math.floor((c.length - 1) / 2)] : null }
const bridge = pick((n) => BRIDGE_PREFERRED.test(n)) ?? pick(() => true)
// What the runners are on at that spot: OSM ways within 20 m of the crossing.
const ground = await overpass(`[out:json][timeout:30];
way(around:20,${bridge.lat.toFixed(4)},${bridge.lng.toFixed(4)})["highway"];
out tags;`)
const groundWays = ground.elements.map((w) => ({ wayId: w.id, name: w.tags.name ?? null, highway: w.tags.highway, bridge: w.tags.bridge ?? null, layer: w.tags.layer ?? null, tunnel: w.tags.tunnel ?? null }))

// ---------- river crossings (Overpass river centreline; also drawn in the preview) ----------
const rb = [Math.floor(bounds[0][0] * 20) / 20, Math.floor(bounds[0][1] * 20) / 20, Math.ceil(bounds[1][0] * 20) / 20, Math.ceil(bounds[1][1] * 20) / 20].map((v) => v.toFixed(2))
const river = await overpass(`[out:json][timeout:60];
way["waterway"="river"]["name"="Wisła"](${rb.join(',')});
out geom;`)
const riverCrossings = []
for (const w of river.elements) {
  if (!w.geometry) continue
  const g = w.geometry.map((n) => toXY([n.lat, n.lon], midLat))
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = toXY(points[i], midLat), p2 = toXY(points[i + 1], midLat)
    for (let b = 0; b < g.length - 1; b++) {
      const hit = segIntersect(p1, p2, g[b], g[b + 1])
      if (hit) riverCrossings.push({ km: +(km[i] + (hit.t * hav(points[i], points[i + 1])) / 1000).toFixed(3), wayId: w.id, eastToWest: points[i + 1][1] < points[i][1] })
    }
  }
}
riverCrossings.sort((a, b) => a.km - b.km)

// ---------- landmarks ----------
const km32 = at(32)
const barrier = at(41.6)
const landmarks = [
  { key: 'start', km: 0, lat: start[0], lng: start[1], label: 'Start' },
  { key: 'bridge', km: bridge.km, lat: bridge.lat, lng: bridge.lng, label: 'Bridge underpass', osmName: bridge.name },
  // km 32 is the southernmost corner of the course, the turn from the long avenue
  // towards the river (km 30-34: down the escarpment, the southern turn, the valley road).
  { key: 'km32', km: 32, lat: km32[0], lng: km32[1], label: 'Southern turn' },
  { key: 'barrier', km: 41.6, lat: barrier[0], lng: barrier[1], label: 'Finish straight' },
  { key: 'finish', km: MARATHON_M / 1000, lat: finish[0], lng: finish[1], label: 'Finish' },
]

const course = {
  name: 'Riverside Marathon',
  distanceKm: MARATHON_M / 1000,
  points,
  km,
  landmarks,
  bounds,
  source: 'OpenStreetMap contributors (ODbL), routed with routing.openstreetmap.de',
}
writeFileSync(OUT_JSON, JSON.stringify(course) + '\n')

// ---------- report ----------
console.log('\nWaypoints (snap distance, routed km at waypoint, OSRM name):')
{
  let acc = 0
  for (const l of legLog) {
    console.log(`  ${String(l.i).padStart(2)} ${l.profile.padEnd(4)} ${WAYPOINTS[l.i].lat.toFixed(4)},${WAYPOINTS[l.i].lng.toFixed(4)}  snap ${String(l.snap).padStart(3)} m  km ${(acc / 1000).toFixed(2).padStart(6)}  ${l.name || '-'}`)
    acc += l.leg ?? 0
  }
}
console.log(`\nPoints: ${points.length}, length ${(totalM / 1000).toFixed(6)} km (haversine on the published polyline)`)
console.log(`Loop gap start-finish: ${loopGap.toFixed(0)} m (limit ${MAX_LOOP_GAP_M}); start is ${startToTarget.toFixed(0)} m from the stadium reference point`)
console.log(`Bounds: ${JSON.stringify(bounds)}  N-S ${nsKm.toFixed(1)} km x E-W ${ewKm.toFixed(1)} km (ratio ${(nsKm / ewKm).toFixed(2)})`)
console.log('Bridges crossing above the course between km 22.5 and 25.5:')
for (const c of crossings) console.log(`  km ${c.km.toFixed(3)}  way ${c.wayId}  ${c.kind} bridge=${c.bridge} layer=${c.layer}  "${c.name}"  @ ${c.lat},${c.lng}`)
console.log(`Ground at the landmark crossing (ways within 20 m):`)
for (const g of groundWays) console.log(`  way ${g.wayId} highway=${g.highway} bridge=${g.bridge} layer=${g.layer} tunnel=${g.tunnel} "${g.name}"`)
console.log('Landmarks:')
for (const l of landmarks) console.log(`  ${l.key.padEnd(8)} km ${String(l.km).padEnd(8)} ${l.lat},${l.lng}  ${l.label}${l.osmName ? ` (${l.osmName})` : ''}`)
console.log(`River crossings (Wisła centreline): ${riverCrossings.map((c) => `km ${c.km} ${c.eastToWest ? 'east->west' : 'west->east'}`).join(', ')}`)
console.log(`Finish straight: km ${straight.fromKm}-${MARATHON_M / 1000}, chord ${straight.chord.toFixed(0)} m for 1500 m run, max ${straight.dev.toFixed(0)} m off the chord line, heading ${straight.bearing.toFixed(0)}°`)
console.log(`Sharp reversals (>135°): ${spikes.length ? spikes.map((s) => `km ${s.km} (${s.turn}°)`).join(', ') : 'none'}`)
console.log(`Back-and-forth overlaps: ${doubles.length ? doubles.map((d) => `km ${d.km}->${d.back}`).join(', ') : 'none'}`)
const problems = []
if (Math.abs(totalM - MARATHON_M) > 0.05) problems.push(`length ${totalM.toFixed(3)} m`)
if (km.some((k, i) => i < km.length - 1 && Math.abs(k - i * 0.025) > 1e-9) || km.at(-1) !== MARATHON_M / 1000) problems.push('km array is not on 25 m steps')
if (loopGap > MAX_LOOP_GAP_M) problems.push(`loop gap ${loopGap.toFixed(0)} m`)
if (!(bridge.km >= BRIDGE_WINDOW_KM[0] && bridge.km <= BRIDGE_WINDOW_KM[1])) problems.push(`bridge at km ${bridge.km}`)
if (riverCrossings.length < 2) problems.push(`${riverCrossings.length} river crossings`)
if (spikes.length || doubles.length) problems.push('spikes or back-and-forth on the line')
if (groundWays.some((g) => g.tunnel && g.tunnel !== 'no' && !g.bridge)) console.log('  note: a tunnel way is near the crossing')
console.log(problems.length ? `\nFAIL: ${problems.join('; ')}` : '\nAll checks pass.')

// Machine-readable build report for COURSE.md.
writeFileSync(join(CACHE, 'last-build.json'), JSON.stringify({ waypoints: WAYPOINTS, legLog, totalM, loopGap, startToTarget, bounds, nsKm, ewKm, crossings, groundWays, riverCrossings, landmarks, spikes, doubles, straight }, null, 2))
writeFileSync(OUT_MD, courseMd())

// ---------- COURSE.md ----------
function courseMd() {
  // Course km of each waypoint: the first close pass of the published line, in order.
  let from = 0
  const wpKm = WAYPOINTS.map((w) => {
    let best = { d: Infinity, i: from }
    for (let i = from; i < points.length; i++) {
      const d = hav(points[i], [w.lat, w.lng])
      if (d < best.d) best = { d, i }
      if (best.d < 60 && d > best.d + 300) break
    }
    from = best.i
    return { km: km[best.i], off: best.d }
  })
  const L = Object.fromEntries(landmarks.map((l) => [l.key, l]))
  const nets = groups.filter((g) => g.profile !== 'direct')
  const directM = legLog.filter((l) => l.profile === 'direct').reduce((t, l) => t + l.leg, 0)
  const row = (...c) => `| ${c.join(' | ')} |`
  const fmt = (v, d = 6) => Number(v).toFixed(d)
  const k = (i) => wpKm[i].km.toFixed(1)
  const [x1, x2] = riverCrossings
  const under = [...new Set(crossings.filter((c) => c.name).map((c) => c.name))]
  const wpRows = WAYPOINTS.map((w, i) => {
    const last = i === WAYPOINTS.length - 1
    return row(i, fmt(w.lat, 5), fmt(w.lng, 5), last ? '-' : w.leg ?? 'foot', w.bearing ? `${w.bearing[0]}±${w.bearing[1]}°` : '', last ? 'past the finish (cut)' : wpKm[i].km.toFixed(2), w.note)
  })
  const crossRows = crossings.map((c) => row(c.km.toFixed(3), `[${c.wayId}](https://www.openstreetmap.org/way/${c.wayId})`, c.kind, c.bridge, c.layer ?? '', c.name ?? '(unnamed)', `${c.lat}, ${c.lng}`))
  const groundRows = groundWays.map((g) => row(`[${g.wayId}](https://www.openstreetmap.org/way/${g.wayId})`, `highway=${g.highway}`, g.bridge ?? '-', g.layer ?? '-', g.tunnel ?? '-', g.name ?? '(unnamed)'))
  const lmRows = landmarks.map((l) => row(`\`${l.key}\``, l.km, l.lat, l.lng, l.label, l.osmName ?? ''))
  return `# Riverside Marathon course

\`course.json\` is a fictional city marathon, exactly 42.195 km, on real streets of
Warsaw, Poland, routed on OpenStreetMap data. The race and its name are made up; the
app never names the city and hides map labels. Everything here is regenerated by

    node scripts/build-course.mjs

which reads its HTTP answers from \`scripts/.course-cache/\` (git-ignored) and only goes
to the network on a cache miss. This file is written by that script; edit the script,
not this file.

## The course

A loop that starts and finishes on the east-bank riverside road next to the national
stadium. It runs north on the east bank, crosses the river on the northern bridge, comes
back south through the west-bank districts and along the west-bank riverside road and
boulevard (under the bridges in the evidence table), climbs into the centre, runs south
down the long avenues, turns at the southern corner, crosses back east on the
south-eastern bridge and comes home along the east-bank riverside road.

Real street names below are for developers only; the UI uses the generic landmark labels.

| km | section |
| --- | --- |
| 0 | Start on Wybrzeże Szczecińskie beside the stadium, heading north |
| 0-${k(3)} | Wybrzeże Szczecińskie, Wybrzeże Helskie, Ratuszowa round the zoo |
| ${k(3)}-${x1.km.toFixed(1)} | Jagiellońska, Modlińska north, onto the northern bridge |
| ${x1.km.toFixed(1)} | River crossing 1, east to west, on the Most Marii Skłodowskiej-Curie |
| ${x1.km.toFixed(1)}-${k(13)} | Aleja Marii Wittek, Marymoncka south through the forest, Słowackiego, Krasińskiego |
| ${k(13)}-${k(15)} | Wybrzeże Gdyńskie / Wybrzeże Gdańskie (Wisłostrada) south along the river |
| ${k(15)}-${k(17)} | Bulwary Wiślane, the river boulevard, under ${under.join(', ')} |
| ${k(17)}-${k(23)} | Up Książęca, Aleje Ujazdowskie, Plac Zbawiciela, Marszałkowska, Puławska |
| ${k(23)}-${k(30)} | Dolna, Jana III Sobieskiego, Idzikowskiego (the southern turn, km 32), Czerniakowska |
| ${k(30)}-${x2.km.toFixed(1)} | Aleja Józefa Becka, onto the south-eastern bridge |
| ${x2.km.toFixed(1)} | River crossing 2, west to east, on the Most Siekierkowski |
| ${x2.km.toFixed(1)}-42.195 | Wał Miedzeszyński along the river, under the road and rail bridges, finish straight to the stadium |

## How it was made

1. **Waypoints** (below) are fed to the OSRM servers of routing.openstreetmap.de
   (\`routed-foot\`, \`routed-car\`, \`overview=full&geometries=geojson\`). Consecutive legs
   with the same profile go in one request: the final build uses ${nets.length} requests, one
   second apart, each cached by a hash of its URL. Foot routing is the default (a closed-road
   race ignores one-way streets); car routing is used where the foot router hops between
   sidewalks, underpasses and service paths at big interchanges (Jagiellońska/Modlińska
   to the northern bridge, the south-eastern bridge and Wał Miedzeszyński). Two short
   hand-placed straight pieces (\`direct\`, ${directM.toFixed(0)} m in total, drawn along real carriageways)
   make turns that neither router allows: the left turn from the northern bridge onto
   Marymoncka and the right turn from Krasińskiego onto the riverside road.
2. Where a foot line meets a car line, the two are spliced at their closest point. Short
   out-and-back stubs (a waypoint snapped to the far side of a road) are removed:
   ${stubM.toFixed(0)} m in total.
3. The line is walked with a 25 m divider: every published point lies on the routed line
   exactly 25 m (haversine chord) from the previous one. This also irons out the
   sidewalk-to-sidewalk jitter of foot routing, which is why the routed line
   (${(rawLen / 1000).toFixed(3)} km including the overshoot) is longer than the chord line.
4. The last waypoint overshoots the start; the walk stops at exactly 42.195 km, which puts
   the finish ${loopGap.toFixed(0)} m past the start on the same road. Coordinates are
   published with 6 decimals; each point is snapped to the neighbouring 6-decimal grid
   point that keeps the running total on 25 m steps, so rounding never accumulates and
   the published polyline measures 42.195 km (\`${(totalM / 1000).toFixed(6)}\`).
5. Overpass (overpass-api.de) is asked for every \`bridge=*\` road or railway way around
   km 22.5-25.5, and the course segments are intersected with them. A second query
   lists what the runners are on at the chosen crossing. A third fetches the river
   centreline, used to count the river crossings and drawn in the preview.
6. The preview is an SVG (Web Mercator) rendered to PNG by Playwright.

## Waypoints

| # | lat | lng | leg | bearing | course km | note |
| --- | --- | --- | --- | --- | --- | --- |
${wpRows.join('\n')}

## Checks (last build)

| check | result |
| --- | --- |
| Length (haversine over the published polyline) | ${(totalM / 1000).toFixed(4)} km, ${points.length} points every 25 m (last step ${(hav(points.at(-2), finish)).toFixed(1)} m) |
| Loop gap, start to finish | ${loopGap.toFixed(0)} m (limit ${MAX_LOOP_GAP_M} m); both on Wybrzeże Szczecińskie, east bank |
| Start to the stadium reference point ${START_TARGET.join(', ')} | ${startToTarget.toFixed(0)} m |
| River crossings (course x Wisła centreline from Overpass) | ${riverCrossings.length}: ${riverCrossings.map((c) => `km ${c.km} ${c.eastToWest ? 'east to west' : 'west to east'}`).join(', ')} |
| Bridge underpass in km 22.5-25.5 | km ${L.bridge.km}, under ${L.bridge.osmName} (details below) |
| Finish straight | km ${straight.fromKm}-42.195: chord ${straight.chord.toFixed(0)} m over 1500 m, at most ${straight.dev.toFixed(0)} m off the straight line, heading ${straight.bearing.toFixed(0)}° (north-west) |
| Turns sharper than 135° between 25 m chords | ${spikes.length ? spikes.map((x) => `km ${x.km}`).join(', ') : 'none'} |
| Course doubling back on itself within 1.5 km | ${doubles.length ? doubles.map((x) => `km ${x.km}`).join(', ') : 'none'} |
| Bounds | ${JSON.stringify(bounds)}: ${nsKm.toFixed(1)} km north-south by ${ewKm.toFixed(1)} km east-west |

### Bridge crossing evidence

Overpass query, ways with \`bridge\` (not \`no\`) and \`highway\` or \`railway\` in the box
${wb.join(', ')}, intersected with the course segments between km 22.5 and 25.5. Every
way below crosses above the course; the course itself is on the boulevard at ground level.

| course km | OSM way | kind | bridge | layer | name | crossing point |
| --- | --- | --- | --- | --- | --- | --- |
${crossRows.join('\n')}

The landmark is the middle of the ${L.bridge.osmName} road carriageway crossings:
**km ${L.bridge.km}, ${L.bridge.lat}, ${L.bridge.lng}**. Ways within 20 m of that point
(\`way(around:20,...)["highway"]\`): the bridge ways at layer 1 overhead, and the
riverside boulevard the runners are on, at ground level with no \`bridge\`/\`tunnel\`/\`layer\` tags:

| OSM way | highway | bridge | layer | tunnel | name |
| --- | --- | --- | --- | --- | --- |
${groundRows.join('\n')}

## Landmarks

Labels are generic on purpose (they can appear in the UI); \`osmName\` is evidence only.

| key | km | lat | lng | label | osmName |
| --- | --- | --- | --- | --- | --- |
${lmRows.join('\n')}

## Attribution

Course geometry © OpenStreetMap contributors, available under the Open Database License
(ODbL), https://www.openstreetmap.org/copyright. Routed with routing.openstreetmap.de (OSRM).
`
}

// ---------- preview ----------
if (!process.argv.includes('--no-preview')) await renderPreview()

async function renderPreview() {
  const W = 1200, H = 1600, PAD = 90
  const mx = (lng) => (lng + 180) / 360
  const my = (lat) => { const s = Math.sin(rad(lat)); return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI) }
  const x0 = mx(bounds[0][1]), x1 = mx(bounds[1][1]), y0 = my(bounds[1][0]), y1 = my(bounds[0][0])
  const scale = Math.min((W - 2 * PAD) / (x1 - x0), (H - 2 * PAD - 60) / (y1 - y0))
  const ox = (W - (x1 - x0) * scale) / 2, oy = 60 + (H - 60 - (y1 - y0) * scale) / 2
  const P = ([la, lo]) => [ox + (mx(lo) - x0) * scale, oy + (my(la) - y0) * scale]
  const metresPerPx = (2 * Math.PI * R * Math.cos(rad(midLat))) / scale
  const path = (pts) => pts.map((p, i) => { const [x, y] = P(p); return `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}` }).join('')
  const riverSvg = river.elements.filter((w) => w.geometry).map((w) => `<path d="${path(w.geometry.map((n) => [n.lat, n.lon]))}"/>`).join('')
  let marks = ''
  for (let k = 5; k < 42; k += 5) {
    const [x, y] = P(at(k))
    marks += `<g><circle cx="${x}" cy="${y}" r="13" fill="#fff" stroke="#1f2937" stroke-width="2"/><text x="${x}" y="${y + 4.5}" text-anchor="middle" font-size="12" font-weight="700" fill="#1f2937">${k}</text></g>`
  }
  const lm = (l, color, dx, dy, anchor) => {
    const [x, y] = P([l.lat, l.lng])
    return `<circle cx="${x}" cy="${y}" r="7" fill="${color}" stroke="#fff" stroke-width="3"/>
<text x="${x + dx}" y="${y + dy}" text-anchor="${anchor}" font-size="17" font-weight="700" fill="${color}" paint-order="stroke" stroke="#fff" stroke-width="5">${l.label} · km ${(+l.km).toFixed(l.key === 'bridge' ? 2 : l.key === 'finish' ? 3 : 1)}</text>`
  }
  const L = Object.fromEntries(landmarks.map((l) => [l.key, l]))
  const [bx, by] = P([L.bridge.lat, L.bridge.lng])
  const barKm = 2, barPx = (barKm * 1000) / metresPerPx
  const html = `<!doctype html><html><body style="margin:0;background:#f7f5ef;font-family:-apple-system,Helvetica,Arial,sans-serif">
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<rect width="${W}" height="${H}" fill="#f7f5ef"/>
<g fill="none" stroke="#b9d7ea" stroke-width="${Math.max(6, 330 / metresPerPx).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round">${riverSvg}</g>
<path d="${path(points)}" fill="none" stroke="#fff" stroke-width="9" stroke-linejoin="round" stroke-linecap="round"/>
<path d="${path(points)}" fill="none" stroke="#e4572e" stroke-width="4.5" stroke-linejoin="round" stroke-linecap="round"/>
<circle cx="${bx}" cy="${by}" r="26" fill="none" stroke="#7c3aed" stroke-width="4"/>
<circle cx="${bx}" cy="${by}" r="40" fill="none" stroke="#7c3aed" stroke-width="1.5" stroke-dasharray="5 5"/>
${marks}
${lm(L.km32, '#0f766e', 16, 6, 'start')}
${lm(L.barrier, '#b45309', 16, 6, 'start')}
${lm(L.bridge, '#7c3aed', -46, 6, 'end')}
${lm(L.start, '#15803d', 16, 18, 'start')}
${lm(L.finish, '#111827', 16, -8, 'start')}
<text x="40" y="58" font-size="34" font-weight="800" fill="#111827">Riverside Marathon</text>
<text x="40" y="92" font-size="18" fill="#374151">${(totalM / 1000).toFixed(3)} km loop · start–finish gap ${loopGap.toFixed(0)} m · bridge underpass at km ${bridge.km.toFixed(2)} · markers every 5 km</text>
<g transform="translate(40 ${H - 70})"><rect width="${barPx}" height="8" fill="#111827"/><text y="-8" font-size="15" fill="#111827">${barKm} km</text></g>
<g transform="translate(${W - 60} ${H - 110})"><path d="M0,-34 L10,0 L0,-8 L-10,0 Z" fill="#111827"/><text y="20" text-anchor="middle" font-size="16" font-weight="700">N</text></g>
<text x="${W - 40}" y="${H - 30}" text-anchor="end" font-size="14" fill="#4b5563">Data © OpenStreetMap contributors (ODbL), routed with routing.openstreetmap.de</text>
</svg></body></html>`
  const { chromium } = await import('playwright')
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: W, height: H } })
  await page.setContent(html)
  await page.screenshot({ path: OUT_PNG })
  await browser.close()
  console.log(`Preview: ${OUT_PNG}`)
}
