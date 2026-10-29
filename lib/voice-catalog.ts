// These public demo lines have shipped recordings. Custom cheers never get public URLs.
export const BUILT_IN_LINES = {
  start: "You're on. Your supporters can cheer now.",
  resume: "Back on. Your supporters' cheers will play here.",
  finish: 'You finished. Well done!',
} as const

export type Announcement = keyof typeof BUILT_IN_LINES
export type VoiceLine = { say: Announcement } | { from: string; message: string }

const clip = (id: string) => `/audio/voice/v1/${id}.mp3`

export const PUBLIC_CHEERS = [
  { id: 'cheer-go', label: 'Go Maya, go!', forRunner: 'Maya', message: 'Go Maya, go!' },
  { id: 'cheer-hike', label: 'The hike in the rain', forRunner: null, message: 'Remember that hike in the rain? You wanted to turn back, and we made it to the top together. Keep going, love.' },
  { id: 'cheer-finish', label: 'Waiting at the finish', forRunner: null, message: "You're nearly there. We're waiting at the finish!" },
].map((line) => ({ ...line, text: line.message, path: clip(line.id) }))

const NAME = /^[\p{L}\p{M}' .-]{1,24}$/u
const clean = (text: string) => text.normalize('NFC').replace(/[\u0000-\u001f\u007f<>{}]/g, ' ').replace(/\s+/g, ' ').trim()

export function normaliseCheer(from: string, message: string) {
  const name = clean(from)
  return { from: NAME.test(name) ? name : 'a supporter', message: clean(message) }
}

export function recordedClip(line: VoiceLine): string | null {
  if ('say' in line) return Object.hasOwn(BUILT_IN_LINES, line.say) ? clip(line.say) : null
  const words = normaliseCheer(line.from, line.message)
  return PUBLIC_CHEERS.find((known) => known.message === words.message)?.path ?? null
}
