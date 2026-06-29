import { KeyRound, LogIn, LogOut } from 'lucide'

import { Icon } from '../Icon'

interface SessionPageProps {
  accessPreview: string
  expiresAt: string
  onLogin: () => void
  onLogout: () => void
}

export function SessionPage(props: SessionPageProps) {
  return (
    <section class="max-w-3xl rounded-lg border border-slate-200 bg-white p-4">
      <div class="flex items-start justify-between gap-3">
        <div>
          <h3 class="text-base font-semibold text-slate-950">Mod WebUI Session</h3>
          <p class="mt-1 text-sm text-slate-600">Token context for mod management flows</p>
        </div>
        <Icon icon={KeyRound} class="h-5 w-5 text-teal-700" />
      </div>

      <dl class="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div class="rounded-md border border-slate-200 bg-slate-50 p-3">
          <dt class="font-medium text-slate-500">Access token</dt>
          <dd class="mt-1 font-mono text-slate-950">{props.accessPreview}</dd>
        </div>
        <div class="rounded-md border border-slate-200 bg-slate-50 p-3">
          <dt class="font-medium text-slate-500">Expires at</dt>
          <dd class="mt-1 wrap-break-word font-mono text-slate-950">{props.expiresAt}</dd>
        </div>
      </dl>

      <div class="mt-4 flex flex-wrap gap-2">
        <button
          class="inline-flex h-10 items-center gap-2 rounded-md bg-teal-700 px-3.5 text-sm font-semibold text-white hover:bg-teal-800 focus:ring-2 focus:ring-teal-600 focus:ring-offset-2 focus:outline-none"
          type="button"
          onClick={props.onLogin}
        >
          <Icon icon={LogIn} class="h-4 w-4" />
          Open WebUI Login
        </button>
        <button
          class="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-3.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 focus:outline-none"
          type="button"
          onClick={props.onLogout}
        >
          <Icon icon={LogOut} class="h-4 w-4" />
          Logout
        </button>
      </div>
    </section>
  )
}
