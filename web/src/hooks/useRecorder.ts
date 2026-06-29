import { createMemo, createSignal } from 'solid-js'

import type { RecorderState } from '../types'

import { formatBytes, formatDuration } from '../format'

function recorderStateLabel(state: RecorderState): string {
  switch (state) {
    case 'requesting':
      return 'Requesting microphone'
    case 'recording':
      return 'Recording'
    case 'ready':
      return 'Ready to play'
    case 'unsupported':
      return 'Unavailable'
    case 'error':
      return 'Error'
    default:
      return 'Idle'
  }
}

function preferredRecordingMimeType(): string {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) {
    return ''
  }

  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
  return candidates.find(candidate => MediaRecorder.isTypeSupported(candidate)) ?? ''
}

export function useRecorder() {
  const [state, setState] = createSignal<RecorderState>('idle')
  const [error, setError] = createSignal('')
  const [seconds, setSeconds] = createSignal(0)
  const [url, setURL] = createSignal('')
  const [size, setSize] = createSignal(0)
  const [mimeType, setMimeType] = createSignal('')

  let mediaRecorder: MediaRecorder | null = null
  let stream: MediaStream | null = null
  let chunks: BlobPart[] = []
  let timer: ReturnType<typeof setInterval> | null = null
  let startedAt = 0

  const label = createMemo(() => recorderStateLabel(state()))
  const statusText = createMemo(() => {
    if (error()) return error()
    if (state() === 'recording') return `Recording ${formatDuration(seconds())}`
    if (state() === 'ready') return `${formatDuration(seconds())} / ${formatBytes(size())}`
    return label()
  })

  function initialize() {
    if (!window.isSecureContext) {
      setState('unsupported')
      setError('Open the app over HTTPS to use the microphone.')
      return
    }

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setState('unsupported')
      setError('This browser does not support in-page audio recording.')
      return
    }

    setState('idle')
    setError('')
  }

  function clearTimer() {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
  }

  function stopStream() {
    stream?.getTracks().forEach(track => track.stop())
    stream = null
  }

  function revokeURL() {
    const currentURL = url()
    if (currentURL) {
      URL.revokeObjectURL(currentURL)
      setURL('')
    }
  }

  function reset() {
    revokeURL()
    setSeconds(0)
    setSize(0)
    setMimeType('')
    setError('')
    setState('idle')
  }

  function dispose() {
    clearTimer()
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.onstop = null
      mediaRecorder.stop()
    }
    mediaRecorder = null
    stopStream()
    revokeURL()
  }

  async function start() {
    if (state() === 'unsupported') {
      return
    }

    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      initialize()
      return
    }

    try {
      clearTimer()
      revokeURL()
      setError('')
      setSize(0)
      setSeconds(0)
      setMimeType('')
      setState('requesting')

      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      chunks = []

      const nextMimeType = preferredRecordingMimeType()
      const options = nextMimeType ? { mimeType: nextMimeType } : undefined
      mediaRecorder = new MediaRecorder(stream, options)

      mediaRecorder.ondataavailable = event => {
        if (event.data.size > 0) {
          chunks.push(event.data)
        }
      }

      mediaRecorder.onerror = () => {
        clearTimer()
        stopStream()
        setState('error')
        setError('Recording failed. Check microphone permissions and try again.')
      }

      mediaRecorder.onstop = () => {
        clearTimer()
        stopStream()

        const blobType = mediaRecorder?.mimeType || nextMimeType || 'audio/webm'
        const blob = new Blob(chunks, { type: blobType })
        chunks = []

        if (blob.size === 0) {
          setState('error')
          setError('The recording was empty.')
          return
        }

        setURL(URL.createObjectURL(blob))
        setSize(blob.size)
        setMimeType(blob.type)
        setState('ready')
      }

      startedAt = Date.now()
      timer = setInterval(() => {
        setSeconds(Math.floor((Date.now() - startedAt) / 1000))
      }, 250)
      mediaRecorder.start()
      setState('recording')
    }
    catch {
      clearTimer()
      stopStream()
      setState('error')
      setError('Microphone access was denied or unavailable.')
    }
  }

  function stop() {
    clearTimer()
    if (!mediaRecorder || mediaRecorder.state === 'inactive') {
      stopStream()
      return
    }

    setSeconds(Math.max(1, Math.floor((Date.now() - startedAt) / 1000)))
    mediaRecorder.stop()
  }

  return {
    dispose,
    initialize,
    label,
    mimeType,
    reset,
    seconds,
    size,
    start,
    state,
    statusText,
    stop,
    url,
  }
}
