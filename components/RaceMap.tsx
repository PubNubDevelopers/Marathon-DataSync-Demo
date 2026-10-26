'use client'
import { useEffect, useRef, useState } from 'react'
import type { GeoJSONSource, Map as MapLibreMap, Marker } from 'maplibre-gl'
import { COURSE_BOUNDS, courseLine, pointAtKm, snapToCourse, FINISH } from '@/lib/course'
import { distanceM, lerp, type LngLat } from '@/lib/geo'
import type { Cheer } from '@/lib/race'

export type Pin = Pick<Cheer, 'id' | 'from' | 'atKm' | 'status' | 'mine'>

declare global {
  interface Window {
    // For scripted demos: where a kilometre of the course is on screen, to tap it.
    __raceMap?: { project: (km: number) => { x: number; y: number } | null }
  }
}

type Props = {
  position?: LngLat | null
  // How long the dot glides from the last fix to the new one, about the time between writes.
  animateMs?: number
  // The runner's trail as stored in the Runner entity, so every map draws the same line.
  trailPoints?: LngLat[]
  initials?: string
  pins?: Pin[]
  // A cheer being placed, before it's pinned.
  draftKm?: number | null
  // 'course' shows the whole course, 'follow' keeps the runner in the middle.
  view?: 'course' | 'follow'
  // Bumps when a cheer plays, to ripple the dot.
  pulse?: number
  // Tapping the course picks a kilometre. Taps farther than 400 m from the course are ignored.
  onPick?: (km: number) => void
  className?: string
}

const STYLE = 'https://tiles.openfreemap.org/styles/dark'
const CORAL = '#f97075'

// OpenFreeMap's dark style, recoloured to the race navy, with no labels: the race is
// fictional, so the map doesn't name the city.
function restyle(map: MapLibreMap) {
  const set = (layer: string, prop: Parameters<MapLibreMap['setPaintProperty']>[1], value: string) => {
    if (map.getLayer(layer)) map.setPaintProperty(layer, prop, value)
  }
  set('background', 'background-color', '#0c1230')
  set('water', 'fill-color', '#16245a')
  set('waterway', 'line-color', '#16245a')
  set('landuse_park', 'fill-color', '#0f2b2c')
  set('landcover_wood', 'fill-color', '#0f2b2c')
  set('landuse_residential', 'fill-color', '#0e1534')
  set('building', 'fill-color', '#121a3c')
  set('building', 'fill-outline-color', '#1a2450')
  set('highway_path', 'line-color', '#222f62')
  set('highway_minor', 'line-color', '#1b264f')
  set('highway_major_inner', 'line-color', '#1d2853')
  set('highway_major_casing', 'line-color', '#2b3b78')
  set('highway_major_subtle', 'line-color', '#2b3b78')
  for (const layer of map.getStyle().layers ?? []) if (layer.type === 'symbol') map.setLayoutProperty(layer.id, 'visibility', 'none')
}

const line = (coords: LngLat[]) => ({
  type: 'Feature' as const,
  properties: {},
  geometry: { type: 'LineString' as const, coordinates: coords.length > 1 ? coords : [] },
})

type Glide = { from: LngLat; to: LngLat; t: number }

// The trail points, then the dot. While the dot glides toward a new fix, the newest
// points can be ahead of it. Leave those out until the dot gets there.
function trailLine(points: LngLat[], head: LngLat | null, glide: Glide | null): LngLat[] {
  if (!head) return points
  let end = points.length
  if (glide && glide.t < 1) {
    const { from, to, t } = glide
    const k = Math.cos((from[1] * Math.PI) / 180)
    const dx = (to[0] - from[0]) * k
    const dy = to[1] - from[1]
    const len2 = dx * dx + dy * dy
    while (len2 > 0 && end > 0) {
      const [x, y] = points[end - 1]
      const along = ((x - from[0]) * k * dx + (y - from[1]) * dy) / len2
      if (along <= t || along > 1.05) break
      end--
    }
  }
  return [...points.slice(0, end), head]
}

const pinHtml = (p: Pin) =>
  `<span class="pin-head"><span>${escapeHtml(p.from.slice(0, 1).toUpperCase())}</span></span><span class="pin-label">${escapeHtml(p.mine ? 'You' : p.from)} · km ${p.atKm.toFixed(1)}</span>`

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

export default function RaceMap({ position, animateMs = 1000, trailPoints, initials = '', pins = [], draftKm = null, view = 'follow', pulse = 0, onPick, className }: Props) {
  const box = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const lib = useRef<typeof import('maplibre-gl') | null>(null)
  const runner = useRef<Marker | null>(null)
  const runnerEl = useRef<HTMLDivElement | null>(null)
  const draft = useRef<Marker | null>(null)
  const pinMarkers = useRef(new Map<string, Marker>())
  const shown = useRef<LngLat | null>(null)
  const glide = useRef<Glide | null>(null)
  const points = useRef<LngLat[]>([])
  points.current = trailPoints ?? []
  const viewRef = useRef(view)
  viewRef.current = view
  const onPickRef = useRef(onPick)
  onPickRef.current = onPick
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    let map: MapLibreMap | undefined
    ;(async () => {
      const maplibre = await import('maplibre-gl')
      if (cancelled || !box.current) return
      lib.current = maplibre
      maplibre.setWorkerUrl('/maplibre-gl-worker.mjs')
      map = new maplibre.Map({
        container: box.current,
        style: STYLE,
        bounds: COURSE_BOUNDS,
        fitBoundsOptions: { padding: 36 },
        attributionControl: { compact: true },
        pitchWithRotate: false,
        dragRotate: false,
      })
      mapRef.current = map
      map.on('click', (e) => {
        if (!onPickRef.current) return
        const snap = snapToCourse([e.lngLat.lng, e.lngLat.lat])
        if (snap.offM <= 400) onPickRef.current(snap.km)
      })
      map.on('load', () => {
        if (!map) return
        restyle(map)
        map.addSource('course', { type: 'geojson', data: line(courseLine) })
        map.addLayer({ id: 'course-casing', type: 'line', source: 'course', paint: { 'line-color': '#0a0e23', 'line-width': 9, 'line-opacity': 0.8 }, layout: { 'line-cap': 'round', 'line-join': 'round' } })
        map.addLayer({ id: 'course', type: 'line', source: 'course', paint: { 'line-color': '#8ea2d8', 'line-width': 4, 'line-opacity': 0.55 }, layout: { 'line-cap': 'round', 'line-join': 'round' } })
        map.addSource('trail', { type: 'geojson', data: line([]), lineMetrics: true })
        map.addLayer({ id: 'trail-glow', type: 'line', source: 'trail', paint: { 'line-color': CORAL, 'line-width': 14, 'line-blur': 10, 'line-opacity': 0.35 }, layout: { 'line-cap': 'round', 'line-join': 'round' } })
        map.addLayer({
          id: 'trail',
          type: 'line',
          source: 'trail',
          paint: { 'line-width': 5, 'line-gradient': ['interpolate', ['linear'], ['line-progress'], 0, 'rgba(249,112,117,0.35)', 1, CORAL] },
          layout: { 'line-cap': 'round', 'line-join': 'round' },
        })
        setReady(true)
        window.__raceMap = {
          project: (km) => {
            if (!map || !box.current) return null
            const pt = map.project(pointAtKm(km))
            const r = box.current.getBoundingClientRect()
            return { x: r.left + pt.x, y: r.top + pt.y }
          },
        }
      })

      // Start, finish, and every 5 km.
      const flag = (cls: string, html: string, at: LngLat) => {
        const el = document.createElement('div')
        el.className = cls
        el.innerHTML = html
        new maplibre.Marker({ element: el }).setLngLat(at).addTo(map!)
      }
      // Only the finish: the start is 205 m before it, and its flag would sit under the runner's dot.
      flag('course-flag finish', '<span>Finish</span>', FINISH)
      for (let km = 5; km < 42; km += 5) flag('km-mark', `<span>${km}</span>`, pointAtKm(km))

      const el = document.createElement('div')
      el.className = 'runner-dot'
      el.innerHTML = '<span class="runner-ring"></span><span class="runner-core"></span>'
      runnerEl.current = el
      runner.current = new maplibre.Marker({ element: el })

      const d = document.createElement('div')
      d.className = 'cheer-pin draft'
      d.innerHTML = '<span class="pin-head"><span>+</span></span><span class="pin-label"></span>'
      draft.current = new maplibre.Marker({ element: d, anchor: 'bottom' })
    })()
    return () => {
      cancelled = true
      map?.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const core = runnerEl.current?.querySelector('.runner-core')
    if (core) core.textContent = initials
  }, [initials, ready])

  useEffect(() => {
    if (!pulse || !runnerEl.current) return
    const el = runnerEl.current
    el.classList.remove('cheered')
    void el.offsetWidth
    el.classList.add('cheered')
  }, [pulse])

  // Cheer pins: one marker per cheer, updated in place.
  useEffect(() => {
    const map = mapRef.current
    const maplibre = lib.current
    if (!ready || !map || !maplibre) return
    const seen = new Set<string>()
    for (const p of pins) {
      seen.add(p.id)
      let m = pinMarkers.current.get(p.id)
      if (!m) {
        const el = document.createElement('div')
        m = new maplibre.Marker({ element: el, anchor: 'bottom' }).setLngLat(pointAtKm(p.atKm)).addTo(map)
        pinMarkers.current.set(p.id, m)
      }
      // Toggle classes rather than set className: MapLibre's own marker classes position it.
      const el = m.getElement()
      el.classList.add('cheer-pin')
      el.classList.toggle('heard', p.status === 'heard')
      el.classList.toggle('mine', !!p.mine)
      el.dataset.km = p.atKm.toFixed(1)
      el.innerHTML = pinHtml(p)
      m.setLngLat(pointAtKm(p.atKm))
    }
    for (const [id, m] of pinMarkers.current) {
      if (!seen.has(id)) {
        m.remove()
        pinMarkers.current.delete(id)
      }
    }
  }, [ready, pins])

  useEffect(() => {
    const map = mapRef.current
    const m = draft.current
    if (!ready || !map || !m) return
    if (draftKm == null) {
      m.remove()
      return
    }
    m.setLngLat(pointAtKm(draftKm)).addTo(map)
    const label = m.getElement().querySelector('.pin-label')
    if (label) label.textContent = `km ${draftKm.toFixed(1)}`
  }, [ready, draftKm])

  // The whole course, or the runner in the middle.
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    if (view === 'course') map.fitBounds(COURSE_BOUNDS, { padding: 36, duration: 700 })
    else if (shown.current) map.easeTo({ center: shown.current, zoom: 14.2, duration: 700 })
  }, [ready, view])

  const drawTrail = () => {
    const src = mapRef.current?.getSource('trail') as GeoJSONSource | undefined
    if (!src) return
    src.setData(line(trailLine(points.current, shown.current, glide.current)))
  }

  // Glide the dot from where it is now to the new fix.
  useEffect(() => {
    const map = mapRef.current
    const marker = runner.current
    if (!ready || !map || !marker || !position) return
    const from = shown.current
    const to = position
    marker.setLngLat(from ?? to).addTo(map)

    // A jump of more than 3 km is a reload or a skip ahead. Don't animate it.
    if (!from || distanceM(from, to) > 3000) {
      shown.current = to
      glide.current = null
      drawTrail()
      if (viewRef.current === 'follow') map.jumpTo({ center: to, zoom: Math.max(map.getZoom(), 14.2) })
      return
    }

    let raf = 0
    const start = performance.now()
    glide.current = { from, to, t: 0 }
    drawTrail()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / animateMs)
      const p = lerp(from, to, t)
      shown.current = p
      glide.current = { from, to, t }
      marker.setLngLat(p)
      drawTrail()
      if (viewRef.current === 'follow') map.jumpTo({ center: p })
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // drawTrail reads refs only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, position, animateMs])

  useEffect(() => {
    if (ready) drawTrail()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, trailPoints])

  return (
    <div className={`run-map ${className ?? ''}`} data-trail-points={trailPoints?.length ?? 0} data-map-ready={ready ? '1' : '0'}>
      <div ref={box} className="run-map-canvas" />
    </div>
  )
}
