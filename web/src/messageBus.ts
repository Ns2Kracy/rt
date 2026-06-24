export type MessageBusSeverity = 'error' | 'progress' | 'status' | 'info'

export interface MessageBusEvent {
  id: string
  eventName: string
  payload: Record<string, unknown>
  sourceId: string
  room: string
  timestamp?: number
  receivedAt: string
  severity: MessageBusSeverity
}

export interface MessageBusFilters {
  query: string
  errorsOnly: boolean
}

export function filterMessageBusEvents(
  events: readonly MessageBusEvent[],
  filters: MessageBusFilters,
): MessageBusEvent[] {
  const query = filters.query.trim().toLowerCase()

  return events.filter(event => {
    if (filters.errorsOnly && event.severity !== 'error') {
      return false
    }

    if (!query) {
      return true
    }

    const haystack = [
      event.eventName,
      event.sourceId,
      event.room,
      stringifyMessageBusPayload(event),
    ].join('\n').toLowerCase()

    return haystack.includes(query)
  })
}

export function formatMessageBusTime(event: MessageBusEvent): string {
  if (!event.receivedAt) {
    return 'unknown'
  }

  const date = new Date(event.receivedAt)
  if (Number.isNaN(date.getTime())) {
    return 'unknown'
  }

  return date.toISOString().slice(11, 19)
}

export function stringifyMessageBusPayload(event: MessageBusEvent): string {
  try {
    return JSON.stringify(event.payload, null, 2)
  }
  catch {
    return String(event.payload)
  }
}
