import { describe, expect, it } from 'vitest'

import {
  filterMessageBusEvents,
  formatMessageBusTime,
  stringifyMessageBusPayload,
  type MessageBusEvent,
} from './messageBus'

const events: MessageBusEvent[] = [
  {
    id: '1',
    eventName: 'raid:create-error',
    payload: {
      SourceID: 'local-storage',
      Room: 'event',
      Properties: { message: 'UUID check error' },
    },
    sourceId: 'local-storage',
    room: 'event',
    receivedAt: '2026-06-24T09:30:00Z',
    severity: 'error',
  },
  {
    id: '2',
    eventName: 'app:install-progress',
    payload: {
      SourceID: 'app-management',
      Room: 'event',
      Properties: { 'app:name': 'Nextcloud' },
    },
    sourceId: 'app-management',
    room: 'event',
    receivedAt: '2026-06-24T09:31:00Z',
    severity: 'progress',
  },
]

describe('message bus helpers', () => {
  it('filters by event name, source, room, and payload content', () => {
    expect(filterMessageBusEvents(events, { query: 'raid', errorsOnly: false })).toHaveLength(1)
    expect(filterMessageBusEvents(events, { query: 'app-management', errorsOnly: false })).toHaveLength(1)
    expect(filterMessageBusEvents(events, { query: 'Nextcloud', errorsOnly: false })).toHaveLength(1)
    expect(filterMessageBusEvents(events, { query: 'missing', errorsOnly: false })).toHaveLength(0)
  })

  it('filters to error events only', () => {
    const filtered = filterMessageBusEvents(events, { query: '', errorsOnly: true })

    expect(filtered).toHaveLength(1)
    expect(filtered[0].eventName).toBe('raid:create-error')
  })

  it('formats event receive times with a fallback', () => {
    expect(formatMessageBusTime(events[0])).toBe('09:30:00')
    expect(formatMessageBusTime({ ...events[0], receivedAt: '' })).toBe('unknown')
  })

  it('stringifies payload JSON', () => {
    expect(stringifyMessageBusPayload(events[1])).toContain('"app:name": "Nextcloud"')
  })
})
