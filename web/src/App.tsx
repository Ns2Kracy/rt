import { Activity, KeyRound, Mic, Wifi } from 'lucide'
import { Show, createMemo, createSignal, onSettled } from 'solid-js'

import type { TargetVersionResponse } from './api'
import type { DemoConfig } from './auth'
import type {
  AuthStatus,
  SocketState,
  UpdateState,
  WorkspaceView,
} from './types'

import { createAPIClient, getWebSocketURL } from './api'
import { WorkspaceShell } from './components/WorkspaceShell'
import {
  buildLoginURL,
  captureTokensFromCurrentURL,
  getAccessToken,
  getExpiresAt,
  logout,
  maskToken,
  shouldAutoRedirectToLogin,
} from './auth'
import { useMessageBusStream } from './hooks/useMessageBusStream'
import { useRecorder } from './hooks/useRecorder'
import { MessageBusPage } from './pages/MessageBusPage'
import { ProbePage } from './pages/ProbePage'
import { RecorderPage } from './pages/RecorderPage'
import { SessionPage } from './pages/SessionPage'

declare global {
  interface Window {
    DEMO_CONFIG?: DemoConfig
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
  const [activeWorkspace, setActiveWorkspace] = createSignal<WorkspaceView>('message-bus')

  let socket: WebSocket | null = null
  const messageBus = useMessageBusStream()
  const recorder = useRecorder()

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
  const workspaceItems = [
    { id: 'message-bus', label: 'Message Bus', icon: Activity },
    { id: 'recorder', label: 'Recorder', icon: Mic },
    { id: 'session', label: 'Session', icon: KeyRound },
    { id: 'probe', label: 'Probe', icon: Wifi },
  ] as const
  const activeWorkspaceLabel = createMemo(() => {
    return workspaceItems.find(item => item.id === activeWorkspace())?.label ?? 'Message Bus'
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
    recorder.initialize()
    void loadTargetVersion()
    messageBus.connect()

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
      messageBus.close()
      recorder.dispose()
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
    <WorkspaceShell
      activeWorkspace={activeWorkspace()}
      activeWorkspaceLabel={activeWorkspaceLabel()}
      authStatus={authStatus()}
      localVersion={localVersion()}
      onWorkspaceChange={setActiveWorkspace}
      targetVersion={targetVersion()?.target_version ?? 'loading'}
      updateLabel={updateLabel()}
      updateState={updateState()}
      workspaceItems={workspaceItems}
    >
      <Show when={activeWorkspace() === 'message-bus'}>
        <MessageBusPage
          errorCount={messageBus.errorCount()}
          errorsOnly={messageBus.errorsOnly()}
          events={messageBus.events()}
          filteredEvents={messageBus.filteredEvents()}
          latestTime={messageBus.latestTime()}
          onClear={messageBus.clearEvents}
          onErrorsOnlyChange={messageBus.setErrorsOnly}
          onPauseToggle={messageBus.togglePause}
          onQueryChange={messageBus.setQuery}
          onSelectedEventIDChange={messageBus.setSelectedEventID}
          paused={messageBus.paused()}
          query={messageBus.query()}
          selectedEvent={messageBus.selectedEvent()}
          state={messageBus.state()}
        />
      </Show>

      <Show when={activeWorkspace() === 'recorder'}>
        <RecorderPage
          mimeType={recorder.mimeType()}
          onReset={recorder.reset}
          onStart={recorder.start}
          onStop={recorder.stop}
          recordingSeconds={recorder.seconds()}
          recordingSize={recorder.size()}
          recordingURL={recorder.url()}
          state={recorder.state()}
          stateLabel={recorder.label()}
          statusText={recorder.statusText()}
        />
      </Show>

      <Show when={activeWorkspace() === 'session'}>
        <SessionPage
          accessPreview={accessPreview()}
          expiresAt={expiresAt()}
          onLogin={redirectToLogin}
          onLogout={handleLogout}
        />
      </Show>

      <Show when={activeWorkspace() === 'probe'}>
        <ProbePage
          onConnect={connectSocket}
          onSend={sendSocketMessage}
          onSocketTextChange={setSocketText}
          socketLog={socketLog()}
          socketState={socketState()}
          socketText={socketText()}
        />
      </Show>
    </WorkspaceShell>
  )
}
