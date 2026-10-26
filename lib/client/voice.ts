'use client'

// The voice in the runner's headphones. Lines come from /api/voice (ElevenLabs) and
// play one after another through Web Audio. If the route can't answer, the browser's
// own speech says them.

export type VoiceLine = { say: 'start' | 'resume' | 'finish' } | { from: string; message: string }
type Runner = { slug: string; secret: string }

let audio: AudioContext | null = null
let queue: Promise<void> = Promise.resolve()

// iOS plays sound only after a tap. Call this from the tap that starts the run.
export function unlockVoice() {
  audio ??= new AudioContext()
  void audio.resume()
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.speak(new SpeechSynthesisUtterance(''))
}

// Resolves when the line has finished playing.
export function speakLine(line: VoiceLine, runner: Runner, fallback: string) {
  queue = queue.then(() => play(line, runner).catch(() => browserSpeech(fallback)))
  return queue
}

async function play(line: VoiceLine, runner: Runner) {
  if (!audio) throw new Error('voice not unlocked')
  const headers = { 'x-race-run': runner.slug, 'x-race-key': runner.secret }
  const res =
    'say' in line
      ? await fetch(`/api/voice?say=${line.say}`, { headers })
      : await fetch('/api/voice', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(line) })
  if (!res.ok) throw new Error(`voice ${res.status}`)
  const buffer = await audio.decodeAudioData(await res.arrayBuffer())
  const source = audio.createBufferSource()
  source.buffer = buffer
  source.connect(audio.destination)
  await new Promise<void>((done) => {
    source.onended = () => done()
    source.start()
  })
}

function browserSpeech(text: string) {
  if (typeof speechSynthesis === 'undefined') return
  return new Promise<void>((done) => {
    const u = new SpeechSynthesisUtterance(text)
    u.rate = 1.02
    u.onend = () => done()
    u.onerror = () => done()
    speechSynthesis.speak(u)
    setTimeout(done, 12000)
  })
}
