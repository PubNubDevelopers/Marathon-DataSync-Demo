// The race course: 42.195 km on OpenStreetMap streets (data/course.json, made by
// scripts/build-course.mjs). Points are [lat, lng] in the file and [lng, lat] here,
// like everywhere else in the app.
import course from '@/data/course.json'
import { distanceM, toRoute, pointAt, type LngLat } from '@/lib/geo'

type Landmark = { key: string; km: number; lat: number; lng: number; label: string }

export const COURSE_KM = course.distanceKm
export const route = toRoute((course.points as [number, number][]).map(([lat, lng]) => [lng, lat] as LngLat))
export const courseLine: LngLat[] = route.coords
export const landmarks = (course.landmarks as Landmark[]).map((l) => ({ ...l, at: [l.lng, l.lat] as LngLat }))
export const landmark = (key: string) => landmarks.find((l) => l.key === key)
export const START: LngLat = courseLine[0]
export const FINISH: LngLat = courseLine[courseLine.length - 1]
const b = course.bounds as [[number, number], [number, number]]
export const COURSE_BOUNDS: [LngLat, LngLat] = [
  [b[0][1], b[0][0]],
  [b[1][1], b[1][0]],
]

// The route's own length can differ from 42.195 by rounding. Scale so km 42.195 is the finish.
const scale = route.lengthM / (COURSE_KM * 1000)

export const pointAtKm = (km: number): LngLat => pointAt(route, Math.max(0, Math.min(COURSE_KM, km)) * 1000 * scale)

// The course up to a distance, for the simulator's trail.
export function courseUpTo(km: number, stepM = 100): LngLat[] {
  const out: LngLat[] = []
  const end = Math.max(0, Math.min(COURSE_KM, km)) * 1000
  for (let m = 0; m < end; m += stepM) out.push(pointAtKm(m / 1000))
  out.push(pointAtKm(km))
  return out
}

// The nearest point on the course to a tap, as a distance along it.
export function snapToCourse(p: LngLat): { km: number; at: LngLat; offM: number } {
  let best = 0
  let bestD = Infinity
  const { coords } = route
  for (let i = 0; i < coords.length; i++) {
    const d = distanceM(coords[i], p)
    if (d < bestD) {
      bestD = d
      best = i
    }
  }
  const km = route.cumulative[best] / 1000 / scale
  return { km: Math.round(km * 10) / 10, at: coords[best], offM: bestD }
}
