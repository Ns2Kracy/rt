import { PlugZap, Send, Wifi } from 'lucide'

import type { SocketState } from '../types'

import { Icon } from '../Icon'
import { OutputBlock } from '../components/OutputBlock'

interface ProbePageProps {
  socketLog: string
  socketState: SocketState
  socketText: string
  onConnect: () => void
  onSend: () => void
  onSocketTextChange: (value: string) => void
}

export function ProbePage(props: ProbePageProps) {
  return (
    <section class="max-w-4xl rounded-lg border border-slate-200 bg-white p-4">
      <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h3 class="text-base font-semibold text-slate-950">Mod Integration Probe</h3>
          <p class="mt-1 text-sm text-slate-600">Probe connection state: {props.socketState}</p>
        </div>
        <span
          class={[
            'h-5 w-5',
            {
              'text-emerald-700': props.socketState === 'open',
              'text-amber-700': props.socketState === 'connecting',
              'text-red-700': props.socketState === 'error',
              'text-slate-500': props.socketState === 'closed',
            },
          ]}
        >
          <Icon icon={Wifi} class="h-5 w-5" />
        </span>
      </div>

      <div class="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto]">
        <label class="sr-only" for="socket-message">WebSocket message</label>
        <input
          id="socket-message"
          class="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
          value={props.socketText}
          onInput={(event: InputEvent & { currentTarget: HTMLInputElement }) => {
            props.onSocketTextChange(event.currentTarget.value)
          }}
        />
        <button
          class="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 focus:outline-none"
          type="button"
          onClick={props.onConnect}
        >
          <Icon icon={PlugZap} class="h-4 w-4" />
          {props.socketState === 'open' ? 'Disconnect' : 'Connect'}
        </button>
        <button
          class="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-teal-700 px-3.5 text-sm font-semibold text-white hover:bg-teal-800 focus:ring-2 focus:ring-teal-600 focus:ring-offset-2 focus:outline-none"
          type="button"
          onClick={props.onSend}
        >
          <Icon icon={Send} class="h-4 w-4" />
          Send
        </button>
      </div>

      <div class="mt-4">
        <OutputBlock value={props.socketLog} tone={props.socketState === 'error' ? 'error' : 'neutral'} />
      </div>
    </section>
  )
}
