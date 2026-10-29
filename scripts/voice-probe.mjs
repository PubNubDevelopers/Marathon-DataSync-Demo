// Observes native Web Audio playback without replacing audio buffers or synthesising
// a signal. Install before the application loads with context.addInitScript().
export function installVoiceProbe() {
  const probe = { decoded: [], decodeFailures: [], started: [], ended: [], requests: [], speechCalls: 0, utterances: 0 }
  window.__voiceProbe = probe

  const originalFetch = window.fetch
  window.fetch = async function (input, init) {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.href)
    const observed = url.pathname.startsWith('/audio/') || url.pathname.startsWith('/voice/') || url.pathname === '/api/voice'
    const entry = observed ? { path: url.pathname, query: url.search, method: init?.method ?? (input instanceof Request ? input.method : 'GET') } : null
    if (entry) probe.requests.push(entry)
    try {
      const response = await originalFetch.apply(this, arguments)
      if (entry) Object.assign(entry, { status: response.status, type: response.headers.get('content-type') })
      return response
    } catch (error) {
      if (entry) entry.error = error.name
      throw error
    }
  }

  if (window.speechSynthesis) {
    const originalSpeak = window.speechSynthesis.speak.bind(window.speechSynthesis)
    window.speechSynthesis.speak = (...args) => {
      probe.speechCalls++
      return originalSpeak(...args)
    }
  }
  if (window.SpeechSynthesisUtterance) {
    const OriginalUtterance = window.SpeechSynthesisUtterance
    window.SpeechSynthesisUtterance = new Proxy(OriginalUtterance, {
      construct(Target, args) {
        probe.utterances++
        return Reflect.construct(Target, args)
      },
    })
  }

  const NativeAudioContext = window.AudioContext
  const decode = NativeAudioContext.prototype.decodeAudioData
  NativeAudioContext.prototype.decodeAudioData = function (...args) {
    const record = (buffer) => {
      let energy = 0
      let peak = 0
      let samples = 0
      for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
        const data = buffer.getChannelData(channel)
        for (let i = 0; i < data.length; i += 8) {
          const value = data[i]
          energy += value * value
          peak = Math.max(peak, Math.abs(value))
          samples++
        }
      }
      const result = { duration: buffer.duration, sampleRate: buffer.sampleRate, channels: buffer.numberOfChannels, rms: Math.sqrt(energy / Math.max(1, samples)), peak }
      probe.decoded.push(result)
      return buffer
    }
    // The app uses the promise form. Keep the native callback form working too.
    if (typeof args[1] === 'function') {
      const callback = args[1]
      args[1] = (buffer) => callback(record(buffer))
      return decode.apply(this, args)
    }
    return decode.apply(this, args).then(record, (error) => {
      probe.decodeFailures.push(error.name)
      throw error
    })
  }

  const createSource = NativeAudioContext.prototype.createBufferSource
  NativeAudioContext.prototype.createBufferSource = function (...args) {
    const source = createSource.apply(this, args)
    const originalStart = source.start
    const originalConnect = source.connect
    const context = this
    let destinationConnected = false
    source.connect = function (...connectArgs) {
      if (connectArgs[0] === context.destination) destinationConnected = true
      return originalConnect.apply(this, connectArgs)
    }
    source.start = function (...startArgs) {
      const entry = { at: performance.now(), contextState: context.state, duration: source.buffer?.duration ?? 0, connected: destinationConnected }
      probe.started.push(entry)
      source.addEventListener('ended', () => probe.ended.push({ at: performance.now(), duration: source.buffer?.duration ?? 0, contextState: context.state }))
      return originalStart.apply(this, startArgs)
    }
    return source
  }
}
