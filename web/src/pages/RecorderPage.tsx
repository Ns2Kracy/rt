import { CircleStop, Mic, RotateCcw } from 'lucide'
import { Show } from 'solid-js'

import type { RecorderState } from '../types'

import { formatBytes, formatDuration } from '../format'
import { Icon } from '../Icon'

interface RecorderPageProps {
  mimeType: string
  recordingSeconds: number
  recordingSize: number
  recordingURL: string
  state: RecorderState
  statusText: string
  stateLabel: string
  onReset: () => void
  onStart: () => void
  onStop: () => void
}

export function RecorderPage(props: RecorderPageProps) {
  return (
    <section class="max-w-4xl rounded-lg border border-slate-200 bg-white p-4">
      <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div class="flex items-center gap-2">
            <Icon icon={Mic} class="h-5 w-5 text-teal-700" />
            <h3 class="text-base font-semibold text-slate-950">Audio Recorder</h3>
          </div>
          <p class="mt-1 text-sm text-slate-600" aria-live="polite">
            {props.statusText}
          </p>
        </div>
        <span
          class={[
            'inline-flex h-7 items-center rounded-md border px-2.5 text-xs font-semibold',
            {
              'border-emerald-200 bg-emerald-50 text-emerald-800': props.state === 'ready',
              'border-red-200 bg-red-50 text-red-800': props.state === 'error' || props.state === 'unsupported',
              'border-teal-200 bg-teal-50 text-teal-900': props.state === 'recording' || props.state === 'requesting',
              'border-slate-200 bg-slate-50 text-slate-700': props.state === 'idle',
            },
          ]}
        >
          {props.stateLabel}
        </span>
      </div>

      <div class="mt-4 grid gap-3 sm:grid-cols-3">
        <div class="rounded-md border border-slate-200 bg-slate-50 p-3">
          <div class="text-xs font-medium text-slate-500">Duration</div>
          <div class="mt-1 font-mono text-lg font-semibold text-slate-950">{formatDuration(props.recordingSeconds)}</div>
        </div>
        <div class="rounded-md border border-slate-200 bg-slate-50 p-3">
          <div class="text-xs font-medium text-slate-500">Size</div>
          <div class="mt-1 font-mono text-lg font-semibold text-slate-950">{props.recordingSize ? formatBytes(props.recordingSize) : 'none'}</div>
        </div>
        <div class="rounded-md border border-slate-200 bg-slate-50 p-3">
          <div class="text-xs font-medium text-slate-500">Format</div>
          <div class="mt-1 truncate font-mono text-lg font-semibold text-slate-950">{props.mimeType || 'pending'}</div>
        </div>
      </div>

      <div class="mt-4 flex flex-wrap gap-2">
        <button
          class="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-teal-700 px-3.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600 focus:ring-2 focus:ring-teal-600 focus:ring-offset-2 focus:outline-none"
          type="button"
          disabled={props.state === 'recording' || props.state === 'requesting' || props.state === 'unsupported'}
          onClick={props.onStart}
        >
          <Icon icon={Mic} class="h-4 w-4" />
          Record
        </button>
        <button
          class="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400 focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 focus:outline-none"
          type="button"
          disabled={props.state !== 'recording'}
          onClick={props.onStop}
        >
          <Icon icon={CircleStop} class="h-4 w-4" />
          Stop
        </button>
        <button
          class="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400 focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 focus:outline-none"
          type="button"
          disabled={!props.recordingURL && props.state !== 'error'}
          onClick={props.onReset}
        >
          <Icon icon={RotateCcw} class="h-4 w-4" />
          Reset
        </button>
      </div>

      <div class="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3">
        <Show
          when={props.recordingURL}
          fallback={
            <div class="flex min-h-28 flex-col items-center justify-center gap-2 px-4 text-center text-sm text-slate-500">
              <Icon icon={Mic} class="h-5 w-5 text-slate-400" />
              No recording available
            </div>
          }
        >
          {url => (
            <audio
              class="h-11 w-full"
              controls
              src={url()}
            />
          )}
        </Show>
      </div>
    </section>
  )
}
