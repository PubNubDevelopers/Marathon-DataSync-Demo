// A run as a GPX 1.1 track, the file Strava and most running apps import. Strava needs a
// time on every point, so the runner's phone records its own track with times while it
// runs (lib/client/track.ts). The track stays on the phone: DataSync only holds the
// simplified trail that supporters' maps draw.

/** [lng, lat, time in ms since the epoch], in the app's [lng, lat] order. */
export type TrackPoint = [number, number, number]

export const GPX_CREATOR = 'Riverside Marathon, a PubNub DataSync demo'

const ENTITIES: Record<string, string> = { '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }
const esc = (text: string) => text.replace(/[<>&'"]/g, (c) => ENTITIES[c])
const iso = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z')

export function toGpx({ name, description, points }: { name: string; description?: string; points: TrackPoint[] }) {
  const start = points[0]?.[2] ?? Date.now()
  const trkpts = points.map(([lng, lat, t]) => `      <trkpt lat="${lat.toFixed(6)}" lon="${lng.toFixed(6)}"><time>${iso(t)}</time></trkpt>`)
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<gpx version="1.1" creator="${esc(GPX_CREATOR)}" xmlns="http://www.topografix.com/GPX/1/1">`,
    `  <metadata><name>${esc(name)}</name>${description ? `<desc>${esc(description)}</desc>` : ''}<time>${iso(start)}</time></metadata>`,
    '  <trk>',
    `    <name>${esc(name)}</name>`,
    '    <type>running</type>',
    '    <trkseg>',
    ...trkpts,
    '    </trkseg>',
    '  </trk>',
    '</gpx>',
    '',
  ].join('\n')
}
