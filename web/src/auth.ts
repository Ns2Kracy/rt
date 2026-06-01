import type { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios'

import axios, { AxiosHeaders } from 'axios'

const ACCESS_TOKEN_KEY = 'access_token'
const REFRESH_TOKEN_KEY = 'refresh_token'
const EXPIRES_AT_KEY = 'expires_at'

const TOKEN_PARAM_NAMES = ['access_token', 'token', 'refresh_token', 'expires_at', 'expires']

export interface TokenResponse {
  access_token: string
  refresh_token?: string
  expires_at?: string
}

export interface DemoConfig {
  localVersion?: string
  loginUrl?: string
  redirectParam?: string
  autoLogin?: boolean
}

interface RetryRequestConfig extends InternalAxiosRequestConfig {
  _retry?: boolean
}

export interface ZimaAuthOptions {
  refreshBaseURL?: string
  onLogout?: () => void
}

function getStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null
  }
  catch {
    return null
  }
}

function getStoredValue(key: string): string | null {
  return getStorage()?.getItem(key) ?? null
}

export function getAccessToken(): string | null {
  return getStoredValue(ACCESS_TOKEN_KEY)
}

export function getRefreshToken(): string | null {
  return getStoredValue(REFRESH_TOKEN_KEY)
}

export function getExpiresAt(): string | null {
  return getStoredValue(EXPIRES_AT_KEY)
}

export function setTokens(options: {
  accessToken?: string
  refreshToken?: string
  expiresAt?: string
}) {
  const storage = getStorage()
  if (!storage) return

  if (options.accessToken) {
    storage.setItem(ACCESS_TOKEN_KEY, options.accessToken)
  }

  if (options.refreshToken) {
    storage.setItem(REFRESH_TOKEN_KEY, options.refreshToken)
  }

  if (options.expiresAt) {
    storage.setItem(EXPIRES_AT_KEY, options.expiresAt)
  }
}

export function clearTokens() {
  const storage = getStorage()
  if (!storage) return

  storage.removeItem(ACCESS_TOKEN_KEY)
  storage.removeItem(REFRESH_TOKEN_KEY)
  storage.removeItem(EXPIRES_AT_KEY)
}

export function logout(onLogout?: () => void) {
  clearTokens()
  onLogout?.()
}

export async function login(
  instance: AxiosInstance,
  username: string,
  password: string,
): Promise<TokenResponse> {
  const res = await instance.post('/v1/users/login', {
    username,
    password,
  })

  const token = res?.data?.data?.token

  if (!token?.access_token) {
    throw new Error('Login failed')
  }

  setTokens({
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresAt: token.expires_at,
  })

  return token
}

export function useZimaAuth(instance: AxiosInstance, options: ZimaAuthOptions = {}) {
  instance.interceptors.request.use(
    (config: InternalAxiosRequestConfig) => {
      const accessToken = getAccessToken()

      if (accessToken) {
        const headers = AxiosHeaders.from(config.headers)
        headers.set('Authorization', `Bearer ${accessToken}`)
        config.headers = headers
      }

      return config
    },
    error => Promise.reject(error),
  )

  let refreshPromise: Promise<string | null> | null = null

  const refreshClient = axios.create({
    baseURL: options.refreshBaseURL ?? instance.defaults.baseURL,
    withCredentials: true,
  })

  async function refreshAccessToken(): Promise<string | null> {
    const refreshToken = getRefreshToken()

    if (!refreshToken) {
      logout(options.onLogout)
      return null
    }

    try {
      const res = await refreshClient.post('/v1/users/refresh', {
        refresh_token: refreshToken,
      })

      const data = res?.data?.data

      if (!data?.access_token) {
        logout(options.onLogout)
        return null
      }

      setTokens({
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: data.expires_at,
      })

      return data.access_token
    }
    catch (err) {
      logout(options.onLogout)
      throw err
    }
  }

  instance.interceptors.response.use(
    response => response,
    async (error: AxiosError) => {
      const originalConfig = error.config as RetryRequestConfig | undefined

      if (!originalConfig) {
        return Promise.reject(error)
      }

      const status = error.response?.status

      if (originalConfig.url?.includes('/v1/users/refresh') && status === 401) {
        logout(options.onLogout)
        return Promise.reject(error)
      }

      if (status !== 401) {
        return Promise.reject(error.response ?? error)
      }

      if (originalConfig._retry) {
        logout(options.onLogout)
        return Promise.reject(error)
      }

      originalConfig._retry = true

      try {
        if (!refreshPromise) {
          refreshPromise = refreshAccessToken().finally(() => {
            refreshPromise = null
          })
        }

        const newAccessToken = await refreshPromise

        if (!newAccessToken) {
          return Promise.reject(error)
        }

        originalConfig.headers = AxiosHeaders.from(originalConfig.headers)
        originalConfig.headers.set('Authorization', `Bearer ${newAccessToken}`)

        return instance(originalConfig)
      }
      catch (err) {
        return Promise.reject(err)
      }
    },
  )
}

function firstParam(params: URLSearchParams, names: string[]): string | undefined {
  for (const name of names) {
    const value = params.get(name)?.trim()
    if (value) return value
  }
  return undefined
}

export function extractTokenResponse(url: URL): TokenResponse | null {
  const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''))
  const accessToken = firstParam(url.searchParams, ['access_token', 'token'])
    ?? firstParam(hashParams, ['access_token', 'token'])
  const refreshToken = firstParam(url.searchParams, ['refresh_token'])
    ?? firstParam(hashParams, ['refresh_token'])
  const expiresAt = firstParam(url.searchParams, ['expires_at', 'expires'])
    ?? firstParam(hashParams, ['expires_at', 'expires'])

  if (!accessToken) {
    return null
  }

  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_at: expiresAt,
  }
}

export function stripTokenParams(url: URL): string {
  for (const name of TOKEN_PARAM_NAMES) {
    url.searchParams.delete(name)
  }

  const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''))
  for (const name of TOKEN_PARAM_NAMES) {
    hashParams.delete(name)
  }

  const hash = hashParams.toString()
  url.hash = hash ? `#${hash}` : ''

  return `${url.pathname}${url.search}${url.hash}`
}

export function captureTokensFromCurrentURL(): TokenResponse | null {
  const url = new URL(globalThis.location.href)
  const token = extractTokenResponse(url)

  if (!token) {
    return null
  }

  setTokens({
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresAt: token.expires_at,
  })

  globalThis.history.replaceState(null, '', stripTokenParams(url))
  return token
}

export function buildLoginURL(currentHref: string, config: DemoConfig = {}): string {
  const currentURL = new URL(currentHref)
  const loginURL = new URL(config.loginUrl ?? '/#/login', currentURL.origin)
  const redirectParam = config.redirectParam ?? 'redirect'

  if (loginURL.hash) {
    const [hashPath, hashSearch = ''] = loginURL.hash.slice(1).split('?')
    const hashParams = new URLSearchParams(hashSearch)
    hashParams.set(redirectParam, currentURL.href)
    loginURL.hash = `${hashPath}?${hashParams.toString()}`
    return loginURL.href
  }

  loginURL.searchParams.set(redirectParam, currentURL.href)
  return loginURL.href
}

export function shouldAutoRedirectToLogin(pathname: string, config: DemoConfig = {}): boolean {
  if (config.autoLogin === false) {
    return false
  }

  return pathname.startsWith('/modules/') || pathname.startsWith('/zimaos-login-demo')
}

export function maskToken(value: string | null): string {
  const token = value?.trim() ?? ''
  if (!token) return 'empty'
  if (token.length <= 12) return '***'
  return `${token.slice(0, 8)}...${token.slice(-4)}`
}
