import { ShieldCheck } from 'lucide'
import { createMemo } from 'solid-js'

import type { AuthStatus } from '../types'

import { Icon } from '../Icon'

export function StatusPill(props: { status: AuthStatus }) {
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
