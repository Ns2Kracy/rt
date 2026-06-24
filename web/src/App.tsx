import {
  AlertTriangle,
  Activity,
  KeyRound,
  LogIn,
  LogOut,
  Pause,
  PlugZap,
  Play,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Trash2,
  Wifi,
} from 'lucide'
import { For, Show, createMemo, createSignal, onSettled } from 'solid-js'

import type { TargetVersionResponse } from './api'
import type { DemoConfig } from './auth'
import type { MessageBusEvent, MessageBusSeverity } from './messageBus'

import { createAPIClient, getMessageBusEventsURL, getWebSocketURL } from './api'
import {
  buildLoginURL,
  captureTokensFromCurrentURL,
  getAccessToken,
  getExpiresAt,
  logout,
  maskToken,
  shouldAutoRedirectToLogin,
} from './auth'
import { Icon } from './Icon'
import {
  filterMessageBusEvents,
  formatMessageBusTime,
  stringifyMessageBusPayload,
} from './messageBus'

declare global {
  interface Window {
    DEMO_CONFIG?: DemoConfig
  }
}

type AuthStatus = 'checking' | 'authenticated' | 'missing' | 'redirecting'
type SocketState = 'closed' | 'connecting' | 'open' | 'error'
type UpdateState = 'checking' | 'available' | 'current'
type MessageBusStreamState = 'closed' | 'connecting' | 'open' | 'error'

function StatusPill(props: { status: AuthStatus }) {
  const label = createMemo(() => {
    switch (props.status) {
      case 'authenticated':
        return 'Authenticated'
      case 'missing':
        return 'Login required'
      case 'redirecting':
        return 'Redirecting'
      default:
        return 'Checking'
    }
  })

  return (
    <span
      class={[
        'inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs font-semibold',
        {
          'border-emerald-200 bg-emerald-50 text-emerald-800': props.status === 'authenticated',
          'border-amber-200 bg-amber-50 text-amber-900': props.status === 'missing' || props.status === 'redirecting',
          'border-slate-200 bg-slate-50 text-slate-700': props.status === 'checking',
        },
      ]}
    >
      <Icon icon={ShieldCheck} class="h-3.5 w-3.5" />
      {label()}
    </span>
  )
}

function OutputBlock(props: { value: string; tone?: 'neutral' | 'error' }) {
  return (
    <pre
      class={[
        'min-h-28 overflow-auto rounded-md border p-3 text-xs leading-5 whitespace-pre-wrap wrap-break-word',
        {
          'border-slate-200 bg-slate-950 text-slate-100': props.tone !== 'error',
          'border-red-200 bg-red-50 text-red-900': props.tone === 'error',
        },
      ]}
    >
      {props.value || 'No output yet'}
    </pre>
  )
}

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

export default function App() {
  const config = window.DEMO_CONFIG ?? {}
  const [authRevision, setAuthRevision] = createSignal(0)
  const [authStatus, setAuthStatus] = createSignal<AuthStatus>('checking')
  const [loginURL, setLoginURL] = createSignal('')
  const [targetVersion, setTargetVersion] = createSignal<TargetVersionResponse | null>(null)
  const [socketState, setSocketState] = createSignal<SocketState>('closed')
  const [socketText, setSocketText] = createSignal('hello websocket')
  const [socketLog, setSocketLog] = createSignal('')
  const [messageBusState, setMessageBusState] = createSignal<MessageBusStreamState>('closed')
  const [messageBusEvents, setMessageBusEvents] = createSignal<MessageBusEvent[]>([])
  const [messageBusQuery, setMessageBusQuery] = createSignal('')
  const [messageBusErrorsOnly, setMessageBusErrorsOnly] = createSignal(false)
  const [messageBusPaused, setMessageBusPaused] = createSignal(false)
  const [selectedMessageBusEventID, setSelectedMessageBusEventID] = createSignal('')

  let socket: WebSocket | null = null
  let messageBusSource: EventSource | null = null

  const client = createAPIClient(() => {
    setAuthStatus('missing')
    setAuthRevision(value => value + 1)
  })

  const localVersion = createMemo(() => config.localVersion ?? 'v0.0.0')
  const accessPreview = createMemo(() => {
    authRevision()
    return maskToken(getAccessToken())
  })
  const expiresAt = createMemo(() => {
    authRevision()
    return getExpiresAt() ?? 'not provided'
  })
  const updateState = createMemo<UpdateState>(() => {
    const target = targetVersion()?.target_version
    if (!target) return 'checking'
    return target === localVersion() ? 'current' : 'available'
  })
  const updateLabel = createMemo(() => {
    switch (updateState()) {
      case 'available':
        return 'Update available'
      case 'current':
        return 'Up to date'
      default:
        return 'Checking update'
    }
  })
  const filteredMessageBusEvents = createMemo(() => {
    return filterMessageBusEvents(messageBusEvents(), {
      query: messageBusQuery(),
      errorsOnly: messageBusErrorsOnly(),
    })
  })
  const selectedMessageBusEvent = createMemo(() => {
    return (
      messageBusEvents().find(event => event.id === selectedMessageBusEventID())
      ?? filteredMessageBusEvents()[0]
      ?? null
    )
  })
  const messageBusErrorCount = createMemo(() => {
    return messageBusEvents().filter(event => event.severity === 'error').length
  })
  const latestMessageBusTime = createMemo(() => {
    const latest = messageBusEvents()[0]
    return latest ? formatMessageBusTime(latest) : 'none'
  })

  async function loadTargetVersion() {
    try {
      const res = await client.get<TargetVersionResponse>('/target-version')
      setTargetVersion(res.data)
    }
    catch {
      setTargetVersion(null)
    }
  }

  onSettled(() => {
    captureTokensFromCurrentURL()
    void loadTargetVersion()
    connectMessageBusStream()

    if (getAccessToken()) {
      setAuthStatus('authenticated')
      setAuthRevision(value => value + 1)
    }
    else {
      const nextLoginURL = buildLoginURL(window.location.href, config)
      setLoginURL(nextLoginURL)

      if (shouldAutoRedirectToLogin(window.location.pathname, config)) {
        setAuthStatus('redirecting')
        window.location.replace(nextLoginURL)
      }
      else {
        setAuthStatus('missing')
      }
    }

    return () => {
      socket?.close()
      messageBusSource?.close()
    }
  })

  function redirectToLogin() {
    window.location.href = loginURL() || buildLoginURL(window.location.href, config)
  }

  function handleLogout() {
    logout()
    socket?.close()
    setSocketState('closed')
    setSocketLog('')
    setAuthStatus('missing')
    setLoginURL(buildLoginURL(window.location.href, config))
    setAuthRevision(value => value + 1)
  }

  function connectSocket() {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.close()
      return
    }

    const token = getAccessToken()
    const socketURL = token
      ? `${getWebSocketURL()}?token=${encodeURIComponent(token)}`
      : getWebSocketURL()

    setSocketState('connecting')
    setSocketLog('connecting...')
    socket = new WebSocket(socketURL)

    socket.onopen = () => {
      setSocketState('open')
      setSocketLog('websocket connected')
    }

    socket.onmessage = event => {
      setSocketLog(value => `${value}\n${event.data}`.trim())
    }

    socket.onerror = () => {
      setSocketState('error')
      setSocketLog(value => `${value}\nwebsocket error`.trim())
    }

    socket.onclose = () => {
      setSocketState('closed')
      setSocketLog(value => `${value}\nwebsocket closed`.trim())
    }
  }

  function sendSocketMessage() {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      setSocketState('error')
      setSocketLog('websocket is not connected')
      return
    }

    socket.send(socketText())
  }

  function connectMessageBusStream() {
    messageBusSource?.close()
    setMessageBusState('connecting')

    const source = new EventSource(getMessageBusEventsURL(), { withCredentials: true })
    messageBusSource = source

    source.onopen = () => {
      setMessageBusState('open')
    }

    source.addEventListener('message-bus', event => {
      if (messageBusPaused()) {
        return
      }

      try {
        const nextEvent = JSON.parse(event.data) as MessageBusEvent
        setMessageBusEvents(current => {
          const withoutDuplicate = current.filter(item => item.id !== nextEvent.id)
          return [nextEvent, ...withoutDuplicate].slice(0, 500)
        })
        setSelectedMessageBusEventID(current => current || nextEvent.id)
      }
      catch {
        setMessageBusState('error')
      }
    })

    source.onerror = () => {
      setMessageBusState('error')
    }
  }

  function toggleMessageBusPause() {
    if (messageBusPaused()) {
      setMessageBusPaused(false)
      connectMessageBusStream()
      return
    }

    setMessageBusPaused(true)
  }

  function clearMessageBusEvents() {
    setMessageBusEvents([])
    setSelectedMessageBusEventID('')
  }

  return (
    <main class="mx-auto flex min-h-dvh w-full max-w-6xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
      <header class="flex flex-col gap-4 border-b border-slate-200 pb-5 md:flex-row md:items-center md:justify-between">
        <div class="flex min-w-0 items-center gap-3">
          <img class="h-12 w-12 rounded-lg" src="./logo.svg" alt="Mod Management Playground" />
          <div class="min-w-0">
            <h1 class="text-2xl font-semibold tracking-normal text-slate-950">Mod Management Playground</h1>
            <p class="mt-1 text-sm text-slate-600">
              A playground for mod management scenarios, experiments, and integrations.
            </p>
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <StatusPill status={authStatus()} />
          <span
            class={[
              'inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs font-semibold',
              {
                'border-amber-200 bg-amber-50 text-amber-900': updateState() === 'available',
                'border-emerald-200 bg-emerald-50 text-emerald-800': updateState() === 'current',
                'border-slate-200 bg-slate-50 text-slate-700': updateState() === 'checking',
              },
            ]}
          >
            <Icon icon={RefreshCw} class="h-3.5 w-3.5" />
            {updateLabel()}
          </span>
          <span class="inline-flex h-7 items-center rounded-md border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700">
            local {localVersion()}
          </span>
          <span class="inline-flex h-7 items-center rounded-md border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700">
            target {targetVersion()?.target_version ?? 'loading'}
          </span>
        </div>
      </header>

      <section class="grid gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <div class="rounded-lg border border-slate-200 bg-white p-4">
          <div class="flex items-start justify-between gap-3">
            <div>
              <h2 class="text-base font-semibold text-slate-950">Mod WebUI Session</h2>
              <p class="mt-1 text-sm text-slate-600">Token context for mod management flows</p>
            </div>
            <Icon icon={KeyRound} class="h-5 w-5 text-teal-700" />
          </div>

          <dl class="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div class="rounded-md border border-slate-200 bg-slate-50 p-3">
              <dt class="font-medium text-slate-500">Access token</dt>
              <dd class="mt-1 font-mono text-slate-950">{accessPreview()}</dd>
            </div>
            <div class="rounded-md border border-slate-200 bg-slate-50 p-3">
              <dt class="font-medium text-slate-500">Expires at</dt>
              <dd class="mt-1 wrap-break-word font-mono text-slate-950">{expiresAt()}</dd>
            </div>
          </dl>

          <div class="mt-4 flex flex-wrap gap-2">
            <button
              class="inline-flex h-10 items-center gap-2 rounded-md bg-teal-700 px-3.5 text-sm font-semibold text-white hover:bg-teal-800 focus:ring-2 focus:ring-teal-600 focus:ring-offset-2 focus:outline-none"
              type="button"
              onClick={redirectToLogin}
            >
              <Icon icon={LogIn} class="h-4 w-4" />
              Open WebUI Login
            </button>
            <button
              class="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-3.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 focus:outline-none"
              type="button"
              onClick={handleLogout}
            >
              <Icon icon={LogOut} class="h-4 w-4" />
              Logout
            </button>
          </div>
        </div>

        <div class="rounded-lg border border-slate-200 bg-white p-4">
        <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 class="text-base font-semibold text-slate-950">Mod Integration Probe</h2>
            <p class="mt-1 text-sm text-slate-600">Probe connection state: {socketState()}</p>
          </div>
          <span
            class={[
              'h-5 w-5',
              {
                'text-emerald-700': socketState() === 'open',
                'text-amber-700': socketState() === 'connecting',
                'text-red-700': socketState() === 'error',
                'text-slate-500': socketState() === 'closed',
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
            value={socketText()}
            onInput={(event: InputEvent & { currentTarget: HTMLInputElement }) => {
              setSocketText(event.currentTarget.value)
            }}
          />
          <button
            class="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 focus:outline-none"
            type="button"
            onClick={connectSocket}
          >
            <Icon icon={PlugZap} class="h-4 w-4" />
            {socketState() === 'open' ? 'Disconnect' : 'Connect'}
          </button>
          <button
            class="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-teal-700 px-3.5 text-sm font-semibold text-white hover:bg-teal-800 focus:ring-2 focus:ring-teal-600 focus:ring-offset-2 focus:outline-none"
            type="button"
            onClick={sendSocketMessage}
          >
            <Icon icon={Send} class="h-4 w-4" />
            Send
          </button>
        </div>

        <div class="mt-4">
          <OutputBlock value={socketLog()} tone={socketState() === 'error' ? 'error' : 'neutral'} />
        </div>
        </div>
      </section>

      <section class="rounded-lg border border-slate-200 bg-white p-4">
        <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div class="flex items-center gap-2">
              <Icon icon={Activity} class="h-5 w-5 text-teal-700" />
              <h2 class="text-base font-semibold text-slate-950">Message Bus Monitor</h2>
            </div>
            <p class="mt-1 text-sm text-slate-600">
              Backend proxy stream: {messageBusState()}{messageBusPaused() ? ' paused' : ''}
            </p>
          </div>

          <div class="grid grid-cols-3 gap-2 text-sm sm:min-w-96">
            <div class="rounded-md border border-slate-200 bg-slate-50 p-3">
              <div class="text-xs font-medium text-slate-500">Events</div>
              <div class="mt-1 font-mono text-lg font-semibold text-slate-950">{messageBusEvents().length}</div>
            </div>
            <div class="rounded-md border border-red-200 bg-red-50 p-3">
              <div class="text-xs font-medium text-red-700">Errors</div>
              <div class="mt-1 font-mono text-lg font-semibold text-red-900">{messageBusErrorCount()}</div>
            </div>
            <div class="rounded-md border border-slate-200 bg-slate-50 p-3">
              <div class="text-xs font-medium text-slate-500">Latest</div>
              <div class="mt-1 font-mono text-lg font-semibold text-slate-950">{latestMessageBusTime()}</div>
            </div>
          </div>
        </div>

        <div class="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto_auto]">
          <div class="relative">
            <Icon icon={Search} class="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <label class="sr-only" for="message-bus-search">Search message bus events</label>
            <input
              id="message-bus-search"
              class="h-10 w-full rounded-md border border-slate-300 bg-white pr-3 pl-9 text-sm text-slate-950 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
              placeholder="Search event, source, room, or payload"
              value={messageBusQuery()}
              onInput={(event: InputEvent & { currentTarget: HTMLInputElement }) => {
                setMessageBusQuery(event.currentTarget.value)
              }}
            />
          </div>

          <label class="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3.5 text-sm font-semibold text-slate-800">
            <input
              class="h-4 w-4 accent-teal-700"
              type="checkbox"
              checked={messageBusErrorsOnly()}
              onChange={(event: Event & { currentTarget: HTMLInputElement }) => {
                setMessageBusErrorsOnly(event.currentTarget.checked)
              }}
            />
            Errors only
          </label>

          <button
            class="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 focus:outline-none"
            type="button"
            onClick={toggleMessageBusPause}
          >
            <Icon icon={messageBusPaused() ? Play : Pause} class="h-4 w-4" />
            {messageBusPaused() ? 'Resume' : 'Pause'}
          </button>

          <button
            class="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-slate-900 px-3.5 text-sm font-semibold text-white hover:bg-slate-800 focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 focus:outline-none"
            type="button"
            onClick={clearMessageBusEvents}
          >
            <Icon icon={Trash2} class="h-4 w-4" />
            Clear
          </button>
        </div>

        <div class="mt-4 grid gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          <div class="min-h-96 overflow-hidden rounded-md border border-slate-200">
            <div class="border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
              Showing {filteredMessageBusEvents().length} events
            </div>
            <div class="max-h-[32rem] overflow-auto">
              <Show
                when={filteredMessageBusEvents().length > 0}
                fallback={
                  <div class="flex min-h-80 flex-col items-center justify-center gap-2 px-4 text-center text-sm text-slate-500">
                    <Icon icon={AlertTriangle} class="h-5 w-5 text-slate-400" />
                    No message bus events
                  </div>
                }
              >
                <For each={filteredMessageBusEvents()}>
                  {event => (
                    <button
                      class={[
                        'grid w-full grid-cols-[5.25rem_minmax(0,1fr)] gap-3 border-b border-slate-100 px-3 py-3 text-left last:border-b-0 hover:bg-slate-50 focus:bg-teal-50 focus:outline-none',
                        {
                          'bg-teal-50': selectedMessageBusEvent()?.id === event.id,
                        },
                      ]}
                      type="button"
                      onClick={() => setSelectedMessageBusEventID(event.id)}
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

          <div class="min-h-96 rounded-md border border-slate-200">
            <div class="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2">
              <div class="min-w-0">
                <div class="truncate text-xs font-semibold text-slate-600">Selected event</div>
                <div class="truncate text-sm font-semibold text-slate-950">
                  {selectedMessageBusEvent()?.eventName ?? 'none'}
                </div>
              </div>
              <Show when={selectedMessageBusEvent()}>
                {event => (
                  <span class={`shrink-0 rounded-md border px-2 py-1 text-xs font-semibold ${severityClass(event().severity)}`}>
                    {event().severity}
                  </span>
                )}
              </Show>
            </div>
            <pre class="max-h-[32rem] min-h-80 overflow-auto p-3 text-xs leading-5 whitespace-pre-wrap wrap-break-word text-slate-800">
              {selectedMessageBusEvent() ? stringifyMessageBusPayload(selectedMessageBusEvent() as MessageBusEvent) : 'No event selected'}
            </pre>
          </div>
        </div>
      </section>
    </main>
  )
}
