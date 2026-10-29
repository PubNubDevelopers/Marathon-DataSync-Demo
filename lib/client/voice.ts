'use client'

import { recordedClip, type VoiceLine } from '@/lib/voice-catalog'
export type { VoiceLine } from '@/lib/voice-catalog'

type Runner = { slug: string; secret: string }
export type PlaybackResult = { ok: true; source: 'recorded' } | { ok: false; reason: 'text-only' | 'unavailable' }

let audio: AudioContext | null = null
let queue: Promise<unknown> = Promise.resolve()
// Only the shipped public recordings are decoded and kept in memory.
const buffers = new Map<string, AudioBuffer>()

// iOS requires this request to happen inside the runner's tap.
export function unlockVoice() {
  try {
    audio ??= new AudioContext()
    void audio.resume().catch(() => {})
  } catch {
    // Playback reports failure to the caller; the cheer remains visible as text.
  }
}

// Resolves after actual playback. Callers must not mark a failed line as heard.
export function speakLine(line: VoiceLine, runner: Runner, onStart?: () => void): Promise<PlaybackResult> {
  if (!recordedClip(line)) return Promise.resolve({ ok: false, reason: 'say' in line ? 'unavailable' : 'text-only' })
  const task = queue.then(async (): Promise<PlaybackResult> => {
    try { return await play(line, runner, onStart) }
    catch { return { ok: false, reason: 'unavailable' } }
  })
  queue = task
  return task
}

async function play(line: VoiceLine, _runner: Runner, onStart?: () => void): Promise<PlaybackResult> {
  if (!audio || audio.state === 'closed') throw new Error('Audio unavailable')
  const context = audio
  const path = recordedClip(line)
  if (!path) throw new Error('No recorded audio')
  const key = path
  let buffer = buffers.get(key)
  if (!buffer) {
    const res = await fetch(path, { signal: AbortSignal.timeout(20_000) })
    if (!res.ok || !res.headers.get('Content-Type')?.startsWith('audio/')) throw new Error('Audio unavailable')
    buffer = await context.decodeAudioData(await res.arrayBuffer())
    if (!buffer.length || !buffer.duration) throw new Error('Empty audio')
    if (buffers.size >= 64) buffers.delete(buffers.keys().next().value!)
    buffers.set(key, buffer)
  }
  if (context.state !== 'running') {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([context.resume(), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Audio blocked')), 3000) })])
    } finally { clearTimeout(timer) }
  }
  if (context.state !== 'running') throw new Error('Audio blocked')
  const source = context.createBufferSource()
  source.buffer = buffer
  source.connect(context.destination)
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      try { source.stop() } catch { /* Already stopped. */ }
      reject(new Error('Audio did not finish'))
    }, (buffer!.duration + 5) * 1000)
    source.onended = () => {
      clearTimeout(timer)
      source.disconnect()
      if (context.state === 'running') resolve()
      else reject(new Error('Audio interrupted'))
    }
    try {
      source.start()
      onStart?.()
    } catch (error) {
      clearTimeout(timer)
      source.disconnect()
      reject(error)
    }
  })
  return { ok: true, source: 'recorded' }
}
