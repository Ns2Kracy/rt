import {
  KeyRound,
  LogIn,
  LogOut,
  PlugZap,
  Send,
  ShieldCheck,
  Wifi,
} from 'lucide'
import { createMemo, createSignal, onSettled } from 'solid-js'

import type { TargetVersionResponse } from './api'
import type { DemoConfig } from './auth'

import { createAPIClient, getWebSocketURL } from './api'
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

declare global {
  interface Window {
    DEMO_CONFIG?: DemoConfig
  }
}

type AuthStatus = 'checking' | 'authenticated' | 'missing' | 'redirecting'
type SocketState = 'closed' | 'connecting' | 'open' | 'error'

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

export default function App() {
  const config = window.DEMO_CONFIG ?? {}
  const [authRevision, setAuthRevision] = createSignal(0)
  const [authStatus, setAuthStatus] = createSignal<AuthStatus>('checking')
  const [loginURL, setLoginURL] = createSignal('')
  const [targetVersion, setTargetVersion] = createSignal<TargetVersionResponse | null>(null)
  const [socketState, setSocketState] = createSignal<SocketState>('closed')
  const [socketText, setSocketText] = createSignal('hello websocket')
  const [socketLog, setSocketLog] = createSignal('')

  let socket: WebSocket | null = null

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

  return (
    <main class="mx-auto flex min-h-dvh w-full max-w-6xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
      <header class="flex flex-col gap-4 border-b border-slate-200 pb-5 md:flex-row md:items-center md:justify-between">
        <div class="flex min-w-0 items-center gap-3">
          <img class="h-12 w-12 rounded-lg" src="./logo.svg" alt="ZimaOS Login Demo" />
          <div class="min-w-0">
            <h1 class="text-2xl font-semibold tracking-normal text-slate-950">ZimaOS Login Demo</h1>
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <StatusPill status={authStatus()} />
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
              <h2 class="text-base font-semibold text-slate-950">WebUI Session</h2>
              <p class="mt-1 text-sm text-slate-600">Token source: browser localStorage</p>
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
            <h2 class="text-base font-semibold text-slate-950">WebSocket Echo</h2>
            <p class="mt-1 text-sm text-slate-600">Connection state: {socketState()}</p>
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
    </main>
  )
}
