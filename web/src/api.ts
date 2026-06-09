import axios from 'axios'

import { useZimaAuth } from './auth'

export interface TargetVersionResponse {
  name: string
  target_version: string
}

function isGatewayPath(pathname: string): boolean {
  return pathname.startsWith('/modules/') || pathname === '/rt' || pathname.startsWith('/rt/')
}

export function getAPIBaseURL(location: Location = globalThis.location): string {
  const params = new URLSearchParams(location.search)

  if (isGatewayPath(location.pathname)) {
    return `${location.origin}/v2/api/rt`
  }

  return params.get('api') ?? `${location.protocol}//${location.hostname}:49321/v2/api/rt`
}

export function getWebSocketURL(location: Location = globalThis.location): string {
  if (isGatewayPath(location.pathname)) {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${protocol}//${location.host}/v2/api/rt/ws`
  }

  return `ws://${location.hostname}:49321/v2/api/rt/ws`
}

export function createAPIClient(onLogout?: () => void) {
  const instance = axios.create({
    baseURL: getAPIBaseURL(),
    withCredentials: true,
    headers: {
      'Cache-Control': 'no-store',
    },
  })

  useZimaAuth(instance, {
    refreshBaseURL: globalThis.location.origin,
    onLogout,
  })

  return instance
}
