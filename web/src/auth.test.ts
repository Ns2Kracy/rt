import { describe, expect, it } from 'vitest'

import {
  buildLoginURL,
  extractTokenResponse,
  maskToken,
  shouldAutoRedirectToLogin,
  stripTokenParams,
} from './auth'

describe('auth URL helpers', () => {
  it('extracts access and refresh tokens from query params', () => {
    const token = extractTokenResponse(
      new URL('https://zima.local/modules/demo/index.html?access_token=a1&refresh_token=r1&expires_at=soon'),
    )

    expect(token).toEqual({
      access_token: 'a1',
      refresh_token: 'r1',
      expires_at: 'soon',
    })
  })

  it('extracts access tokens from hash params', () => {
    const token = extractTokenResponse(
      new URL('https://zima.local/modules/demo/index.html#token=hash-token'),
    )

    expect(token?.access_token).toBe('hash-token')
  })

  it('strips token params without deleting unrelated state', () => {
    const cleanURL = stripTokenParams(
      new URL('https://zima.local/modules/demo/index.html?tab=ws&access_token=a#token=b&panel=probe'),
    )

    expect(cleanURL).toBe('/modules/demo/index.html?tab=ws#panel=probe')
  })

  it('builds WebUI login URLs with configurable redirect params', () => {
    const loginURL = buildLoginURL('https://zima.local/modules/demo/index.html?tab=api', {
      loginUrl: '/signin',
      redirectParam: 'redirect_uri',
    })

    expect(loginURL).toBe(
      'https://zima.local/signin?redirect_uri=https%3A%2F%2Fzima.local%2Fmodules%2Fdemo%2Findex.html%3Ftab%3Dapi',
    )
  })

  it('uses the ZimaOS hash login route by default', () => {
    const loginURL = buildLoginURL('http://10.0.0.85/modules/zimaos-login-demo/index.html')

    expect(loginURL).toBe(
      'http://10.0.0.85/#/login?redirect=http%3A%2F%2F10.0.0.85%2Fmodules%2Fzimaos-login-demo%2Findex.html',
    )
  })

  it('only auto redirects deployed module paths by default', () => {
    expect(shouldAutoRedirectToLogin('/modules/zimaos-login-demo/index.html')).toBe(true)
    expect(shouldAutoRedirectToLogin('/src/main.tsx')).toBe(false)
    expect(shouldAutoRedirectToLogin('/modules/demo/index.html', { autoLogin: false })).toBe(false)
  })

  it('masks long and empty token values', () => {
    expect(maskToken(null)).toBe('empty')
    expect(maskToken('1234567890abcdef')).toBe('12345678...cdef')
  })
})
