'use client'
import type { TrackPoint } from '@/lib/gpx'

// The run as this phone recorded it, a point with a time, for the GPX export. Kept in
// localStorage per runner, so a reload in the middle of a run keeps what came before.
// It never goes to DataSync or to the server, except as the file the runner uploads.

const key = (slug: string) => `race.track.${slug}`

export function loadTrack(slug: string): TrackPoint[] {
  try {
    const points = JSON.parse(localStorage.getItem(key(slug)) ?? '[]')
    return Array.isArray(points)
      ? points.filter((p): p is TrackPoint => Array.isArray(p) && p.length === 3 && p.every((v) => typeof v === 'number' && Number.isFinite(v)) && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90 && Math.abs(p[2]) <= 8.64e15)
      : []
  } catch {
    return []
  }
}

export function saveTrack(slug: string, points: TrackPoint[]) {
  try {
    localStorage.setItem(key(slug), JSON.stringify(points))
  } catch {
    // Storage full or blocked: the export still has the points in memory until a reload.
  }
}
