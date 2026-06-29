import { createMemo, createSignal } from 'solid-js'

import type { MessageBusEvent } from '../messageBus'

import { getMessageBusEventsURL } from '../api'
import {
  filterMessageBusEvents,
  formatMessageBusTime,
} from '../messageBus'
import type { MessageBusStreamState } from '../types'

export function useMessageBusStream() {
  const [state, setState] = createSignal<MessageBusStreamState>('closed')
  const [events, setEvents] = createSignal<MessageBusEvent[]>([])
  const [query, setQuery] = createSignal('')
  const [errorsOnly, setErrorsOnly] = createSignal(false)
  const [paused, setPaused] = createSignal(false)
  const [selectedEventID, setSelectedEventID] = createSignal('')

  let source: EventSource | null = null

  const filteredEvents = createMemo(() => {
    return filterMessageBusEvents(events(), {
      query: query(),
      errorsOnly: errorsOnly(),
    })
  })
  const selectedEvent = createMemo(() => {
    return (
      events().find(event => event.id === selectedEventID())
      ?? filteredEvents()[0]
      ?? null
    )
  })
  const errorCount = createMemo(() => {
    return events().filter(event => event.severity === 'error').length
  })
  const latestTime = createMemo(() => {
    const latest = events()[0]
    return latest ? formatMessageBusTime(latest) : 'none'
  })

  function connect() {
    source?.close()
    setState('connecting')

    const nextSource = new EventSource(getMessageBusEventsURL(), { withCredentials: true })
    source = nextSource

    nextSource.onopen = () => {
      setState('open')
    }

    nextSource.addEventListener('message-bus', event => {
      if (paused()) {
        return
      }

      try {
        const nextEvent = JSON.parse(event.data) as MessageBusEvent
        setEvents(current => {
          const withoutDuplicate = current.filter(item => item.id !== nextEvent.id)
          return [nextEvent, ...withoutDuplicate].slice(0, 500)
        })
        setSelectedEventID(current => current || nextEvent.id)
      }
      catch {
        setState('error')
      }
    })

    nextSource.onerror = () => {
      setState('error')
    }
  }

  function togglePause() {
    if (paused()) {
      setPaused(false)
      connect()
      return
    }

    setPaused(true)
  }

  function clearEvents() {
    setEvents([])
    setSelectedEventID('')
  }

  function close() {
    source?.close()
    source = null
  }

  return {
    clearEvents,
    close,
    connect,
    errorCount,
    errorsOnly,
    events,
    filteredEvents,
    latestTime,
    paused,
    query,
    selectedEvent,
    setErrorsOnly,
    setQuery,
    setSelectedEventID,
    state,
    togglePause,
  }
}
