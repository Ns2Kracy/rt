import { RefreshCw, type IconNode } from 'lucide'
import { For } from 'solid-js'
import type { JSX } from '@solidjs/web'

import type { AuthStatus, UpdateState, WorkspaceView } from '../types'

import { Icon } from '../Icon'
import { StatusPill } from './StatusPill'

export interface WorkspaceItem {
  id: WorkspaceView
  label: string
  icon: IconNode
}

interface WorkspaceShellProps {
  activeWorkspace: WorkspaceView
  activeWorkspaceLabel: string
  authStatus: AuthStatus
  children: JSX.Element
  localVersion: string
  targetVersion: string
  updateLabel: string
  updateState: UpdateState
  workspaceItems: readonly WorkspaceItem[]
  onWorkspaceChange: (workspace: WorkspaceView) => void
}

function UpdatePill(props: { label: string; state: UpdateState }) {
  return (
    <span
      class={[
        'inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs font-semibold',
        {
          'border-amber-200 bg-amber-50 text-amber-900': props.state === 'available',
          'border-emerald-200 bg-emerald-50 text-emerald-800': props.state === 'current',
          'border-slate-200 bg-slate-50 text-slate-700': props.state === 'checking',
        },
      ]}
    >
      <Icon icon={RefreshCw} class="h-3.5 w-3.5" />
      {props.label}
    </span>
  )
}

export function WorkspaceShell(props: WorkspaceShellProps) {
  return (
    <main class="min-h-dvh">
      <div class="mx-auto flex min-h-dvh w-full max-w-[90rem] flex-col lg:flex-row">
        <aside class="hidden w-64 shrink-0 border-r border-slate-200 bg-white px-4 py-5 lg:flex lg:flex-col">
          <div class="flex min-w-0 items-center gap-3">
            <img class="h-10 w-10 rounded-lg" src="./logo.svg" alt="Mod Management Playground" />
            <div class="min-w-0">
              <h1 class="truncate text-base font-semibold tracking-normal text-slate-950">Mod Management Playground</h1>
              <p class="mt-0.5 text-xs text-slate-500">rt module</p>
            </div>
          </div>

          <nav class="mt-6 flex flex-col gap-1" aria-label="Workspace">
            <For each={props.workspaceItems}>
              {item => (
                <button
                  class={[
                    'flex h-10 items-center gap-2 rounded-md px-3 text-left text-sm font-semibold focus:ring-2 focus:ring-teal-600 focus:ring-offset-2 focus:outline-none',
                    {
                      'bg-teal-50 text-teal-900': props.activeWorkspace === item.id,
                      'text-slate-700 hover:bg-slate-50': props.activeWorkspace !== item.id,
                    },
                  ]}
                  type="button"
                  onClick={() => props.onWorkspaceChange(item.id)}
                >
                  <Icon icon={item.icon} class="h-4 w-4 shrink-0" />
                  {item.label}
                </button>
              )}
            </For>
          </nav>

          <div class="mt-auto flex flex-col gap-2 border-t border-slate-200 pt-4">
            <StatusPill status={props.authStatus} />
            <UpdatePill label={props.updateLabel} state={props.updateState} />
            <div class="grid gap-1 text-xs text-slate-600">
              <span>local {props.localVersion}</span>
              <span>target {props.targetVersion}</span>
            </div>
          </div>
        </aside>

        <div class="flex min-w-0 flex-1 flex-col">
          <header class="border-b border-slate-200 bg-white px-4 py-4 sm:px-6 lg:hidden">
            <div class="flex min-w-0 items-center gap-3">
              <img class="h-10 w-10 rounded-lg" src="./logo.svg" alt="Mod Management Playground" />
              <div class="min-w-0">
                <h1 class="truncate text-lg font-semibold tracking-normal text-slate-950">Mod Management Playground</h1>
                <p class="mt-0.5 text-xs text-slate-500">{props.activeWorkspaceLabel}</p>
              </div>
            </div>
            <div class="mt-3 flex flex-wrap items-center gap-2">
              <StatusPill status={props.authStatus} />
              <UpdatePill label={props.updateLabel} state={props.updateState} />
            </div>
          </header>

          <nav class="grid grid-cols-2 gap-2 border-b border-slate-200 bg-white px-4 py-3 sm:grid-cols-4 sm:px-6 lg:hidden" aria-label="Workspace">
            <For each={props.workspaceItems}>
              {item => (
                <button
                  class={[
                    'inline-flex h-10 items-center justify-center gap-2 rounded-md border px-2 text-sm font-semibold focus:ring-2 focus:ring-teal-600 focus:ring-offset-2 focus:outline-none',
                    {
                      'border-teal-200 bg-teal-50 text-teal-900': props.activeWorkspace === item.id,
                      'border-slate-200 bg-white text-slate-700': props.activeWorkspace !== item.id,
                    },
                  ]}
                  type="button"
                  onClick={() => props.onWorkspaceChange(item.id)}
                >
                  <Icon icon={item.icon} class="h-4 w-4 shrink-0" />
                  <span class="truncate">{item.label}</span>
                </button>
              )}
            </For>
          </nav>

          <header class="hidden border-b border-slate-200 bg-white px-6 py-4 lg:block">
            <div class="flex items-center justify-between gap-4">
              <div>
                <p class="text-xs font-semibold uppercase tracking-normal text-slate-500">Workspace</p>
                <h2 class="mt-1 text-xl font-semibold tracking-normal text-slate-950">{props.activeWorkspaceLabel}</h2>
              </div>
              <div class="flex flex-wrap items-center justify-end gap-2">
                <span class="inline-flex h-7 items-center rounded-md border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700">
                  local {props.localVersion}
                </span>
                <span class="inline-flex h-7 items-center rounded-md border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700">
                  target {props.targetVersion}
                </span>
              </div>
            </div>
          </header>

          <div class="min-w-0 flex-1 px-4 py-4 sm:px-6 lg:px-6">
            {props.children}
          </div>
        </div>
      </div>
    </main>
  )
}
