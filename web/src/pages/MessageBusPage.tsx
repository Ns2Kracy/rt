import { AlertTriangle, Activity, Pause, Play, Search, Trash2 } from 'lucide'
import { For, Show, type Setter } from 'solid-js'

import type { MessageBusEvent, MessageBusSeverity } from '../messageBus'
import type { MessageBusStreamState } from '../types'

import { Icon } from '../Icon'
import { formatMessageBusTime, stringifyMessageBusPayload } from '../messageBus'

function severityClass(severity: MessageBusSeverity): string {
  switch (severity) {
    case 'error':
      return 'border-red-200 bg-red-50 text-red-800'
    case 'progress':
      return 'border-sky-200 bg-sky-50 text-sky-800'
    case 'status':
      return 'border-amber-200 bg-amber-50 text-amber-900'
    default:
      return 'border-slate-200 bg-slate-50 text-slate-700'
  }
}

interface MessageBusPageProps {
  errorCount: number
  errorsOnly: boolean
  events: MessageBusEvent[]
  filteredEvents: MessageBusEvent[]
  latestTime: string
  paused: boolean
  query: string
  selectedEvent: MessageBusEvent | null
  state: MessageBusStreamState
  onClear: () => void
  onErrorsOnlyChange: (errorsOnly: boolean) => void
  onPauseToggle: () => void
  onQueryChange: (query: string) => void
  onSelectedEventIDChange: Setter<string>
}

export function MessageBusPage(props: MessageBusPageProps) {
  return (
    <section class="flex min-h-[calc(100dvh-8rem)] flex-col gap-4">
      <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div class="flex items-center gap-2">
            <Icon icon={Activity} class="h-5 w-5 text-teal-700" />
            <h3 class="text-base font-semibold text-slate-950">Message Bus Monitor</h3>
          </div>
          <p class="mt-1 text-sm text-slate-600">
            Backend proxy stream: {props.state}{props.paused ? ' paused' : ''}
          </p>
        </div>

        <div class="grid grid-cols-3 gap-2 text-sm sm:min-w-96">
          <div class="rounded-md border border-slate-200 bg-white p-3">
            <div class="text-xs font-medium text-slate-500">Events</div>
            <div class="mt-1 font-mono text-lg font-semibold text-slate-950">{props.events.length}</div>
          </div>
          <div class="rounded-md border border-red-200 bg-red-50 p-3">
            <div class="text-xs font-medium text-red-700">Errors</div>
            <div class="mt-1 font-mono text-lg font-semibold text-red-900">{props.errorCount}</div>
          </div>
          <div class="rounded-md border border-slate-200 bg-white p-3">
            <div class="text-xs font-medium text-slate-500">Latest</div>
            <div class="mt-1 font-mono text-lg font-semibold text-slate-950">{props.latestTime}</div>
          </div>
        </div>
      </div>

      <div class="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto_auto]">
        <div class="relative">
          <Icon icon={Search} class="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <label class="sr-only" for="message-bus-search">Search message bus events</label>
          <input
            id="message-bus-search"
            class="h-10 w-full rounded-md border border-slate-300 bg-white pr-3 pl-9 text-sm text-slate-950 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
            placeholder="Search event, source, room, or payload"
            value={props.query}
            onInput={(event: InputEvent & { currentTarget: HTMLInputElement }) => {
              props.onQueryChange(event.currentTarget.value)
            }}
          />
        </div>

        <label class="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3.5 text-sm font-semibold text-slate-800">
          <input
            class="h-4 w-4 accent-teal-700"
            type="checkbox"
            checked={props.errorsOnly}
            onChange={(event: Event & { currentTarget: HTMLInputElement }) => {
              props.onErrorsOnlyChange(event.currentTarget.checked)
            }}
          />
          Errors only
        </label>

        <button
          class="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 focus:outline-none"
          type="button"
          onClick={props.onPauseToggle}
        >
          <Icon icon={props.paused ? Play : Pause} class="h-4 w-4" />
          {props.paused ? 'Resume' : 'Pause'}
        </button>

        <button
          class="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-slate-900 px-3.5 text-sm font-semibold text-white hover:bg-slate-800 focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 focus:outline-none"
          type="button"
          onClick={props.onClear}
        >
          <Icon icon={Trash2} class="h-4 w-4" />
          Clear
        </button>
      </div>

      <div class="flex min-h-[34rem] flex-1 flex-col gap-4">
        <div class="overflow-hidden rounded-md border border-slate-200 bg-white">
          <div class="border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
            Showing {props.filteredEvents.length} events
          </div>
          <div class="max-h-[30rem] overflow-auto">
            <Show
              when={props.filteredEvents.length > 0}
              fallback={
                <div class="flex min-h-80 flex-col items-center justify-center gap-2 px-4 text-center text-sm text-slate-500">
                  <Icon icon={AlertTriangle} class="h-5 w-5 text-slate-400" />
                  No message bus events
                </div>
              }
            >
              <For each={props.filteredEvents}>
                {event => (
                  <button
                    class={[
                      'grid w-full grid-cols-[5.25rem_minmax(0,1fr)] gap-3 border-b border-slate-100 px-3 py-3 text-left last:border-b-0 hover:bg-slate-50 focus:bg-teal-50 focus:outline-none',
                      {
                        'bg-teal-50': props.selectedEvent?.id === event.id,
                      },
                    ]}
                    type="button"
                    onClick={() => props.onSelectedEventIDChange(event.id)}
                  >
                    <span class="font-mono text-xs text-slate-500">{formatMessageBusTime(event)}</span>
                    <span class="min-w-0">
                      <span class="flex min-w-0 items-center gap-2">
                        <span class={`rounded-md border px-1.5 py-0.5 text-[11px] font-semibold ${severityClass(event.severity)}`}>
                          {event.severity}
                        </span>
                        <span class="truncate text-sm font-semibold text-slate-950">{event.eventName}</span>
                      </span>
                      <span class="mt-1 flex min-w-0 gap-2 text-xs text-slate-500">
                        <span class="truncate">{event.sourceId || 'unknown source'}</span>
                        <span class="shrink-0">/</span>
                        <span class="truncate">{event.room || 'no room'}</span>
                      </span>
                    </span>
                  </button>
                )}
              </For>
            </Show>
          </div>
        </div>

        <div class="rounded-md border border-slate-200 bg-white">
          <div class="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2">
            <div class="min-w-0">
              <div class="truncate text-xs font-semibold text-slate-600">Event detail</div>
              <div class="truncate text-sm font-semibold text-slate-950">
                {props.selectedEvent?.eventName ?? 'Select an event'}
              </div>
            </div>
            <Show when={props.selectedEvent}>
              {event => (
                <span class={`shrink-0 rounded-md border px-2 py-1 text-xs font-semibold ${severityClass(event().severity)}`}>
                  {event().severity}
                </span>
              )}
            </Show>
          </div>
          <Show
            when={props.selectedEvent}
            fallback={
              <div class="flex min-h-40 items-center justify-center px-4 text-center text-sm text-slate-500">
                Click an event above to inspect the full payload.
              </div>
            }
          >
            {event => (
              <pre class="max-h-[28rem] min-h-40 overflow-auto p-3 text-xs leading-5 whitespace-pre-wrap wrap-break-word text-slate-800">
                {stringifyMessageBusPayload(event())}
              </pre>
            )}
          </Show>
        </div>
      </div>
    </section>
  )
}
