import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CounterContext, makeCan, type Counter } from './counter'
import type { Account, AuthApi, BranchState, DataStore } from './data/types'
import { roleLabels } from './lib/permissions'
import { TablesView } from './components/TablesView'
import { PlayersView } from './components/PlayersView'
import { SettingsView } from './components/SettingsView'
import { KhataView } from './components/KhataView'
import { Icon, Logo, type IconName } from './components/icons'

type Tab = 'tables' | 'players' | 'khata' | 'settings'
const BRANCH_KEY = 'snooker-branch'
const ORG_KEY = 'snooker-org'

function remembered(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}
function remember(key: string, value: string) {
  try { localStorage.setItem(key, value) } catch { /* private mode: just don't remember */ }
}

export interface AppProps {
  store: DataStore
  account: Account
  auth: AuthApi
  onLogout: () => void
}

export function App({ store, account, auth, onLogout }: AppProps) {
  const [state, setState] = useState<BranchState | null>(null)
  const [orgId, setOrgId] = useState(() => {
    const saved = remembered(ORG_KEY)
    return account.memberships.some((m) => m.org_id === saved) ? saved! : account.memberships[0].org_id
  })
  const [branchId, setBranchId] = useState<string | null>(() => remembered(BRANCH_KEY))
  const [tab, setTab] = useState<Tab>('tables')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const target = useRef({ orgId, branchId })
  target.current = { orgId, branchId }

  const reload = useCallback(async () => {
    try {
      const { orgId, branchId } = target.current
      setState(await store.load(orgId, branchId))
      setLoadError(null)
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e))
    }
  }, [store])

  useEffect(() => { void reload() }, [reload, orgId, branchId])
  useEffect(() => store.subscribe(() => void reload()), [store, reload])
  // Catch up after the phone/tablet wakes up or regains internet.
  useEffect(() => {
    const onFocus = () => void reload()
    window.addEventListener('focus', onFocus)
    window.addEventListener('online', onFocus)
    return () => {
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('online', onFocus)
    }
  }, [reload])

  const run = useCallback(async (action: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    try {
      await action()
      await reload()
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      return false
    } finally {
      setBusy(false)
    }
  }, [reload])

  const counter = useMemo<Counter | null>(
    () => state && { store, state, run, busy, can: makeCan(state) },
    [store, state, run, busy],
  )

  if (!counter) {
    return (
      <div className="grid min-h-screen place-items-center p-6 text-center">
        {loadError ? (
          <div>
            <p className="mb-3 font-semibold text-red-700">Could not load: {loadError}</p>
            <div className="flex justify-center gap-4">
              <button className="underline" onClick={() => void reload()}>Try again</button>
              <button className="underline" onClick={onLogout}>Log out</button>
            </div>
          </div>
        ) : <p className="text-stone-500">Loading…</p>}
      </div>
    )
  }

  const selectBranch = (id: string) => {
    remember(BRANCH_KEY, id)
    setBranchId(id)
  }
  const selectOrg = (id: string) => {
    remember(ORG_KEY, id)
    setOrgId(id)
    setBranchId(null)
    setTab('tables')
  }

  const { state: s } = counter
  const tabs: [Tab, string, IconName][] = [
    ['tables', 'Tables', 'table'],
    ['players', 'Bills', 'receipt'],
    ...(counter.can('collect') ? [['khata', 'Khata', 'book'] as [Tab, string, IconName]] : []),
    counter.can('manage') ? ['settings', 'Settings', 'sliders'] : ['settings', 'Account', 'user'],
  ]

  return (
    <CounterContext.Provider value={counter}>
      <div className="min-h-screen pb-24">
        <header className="felt sticky top-0 z-30 px-3 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] text-white shadow-lg shadow-felt-950/20 sm:px-4">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <Logo className="h-9 w-9 shrink-0" />
              <div className="min-w-0">
                {s.branches.length > 1 ? (
                  <select
                    value={s.branch.id}
                    onChange={(e) => selectBranch(e.target.value)}
                    className="-ml-1 max-w-full rounded-lg bg-transparent px-1 text-lg font-extrabold outline-none hover:bg-white/10 [&>option]:text-stone-900"
                    aria-label="Shop"
                  >
                    {s.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                ) : (
                  <h1 className="truncate text-lg font-extrabold tracking-tight">{s.branch.name}</h1>
                )}
                <p className="truncate text-xs text-white/60">{s.org.name}</p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5 text-xs font-bold">
              {store.mode === 'demo' && <span className="rounded-full bg-amber-400 px-2 py-1 text-stone-900">DEMO</span>}
              <span className="rounded-full bg-white/10 px-2.5 py-1 ring-1 ring-inset ring-white/20">{roleLabels[s.role]}</span>
            </div>
          </div>
        </header>

        {error && (
          <div className="sticky top-20 z-30 px-3 pt-3">
            <div role="alert" className="rise mx-auto flex max-w-xl items-start gap-2 rounded-2xl bg-red-700 p-3 text-white shadow-xl">
              <Icon name="alert" className="mt-0.5 h-5 w-5 shrink-0" />
              <span className="flex-1">{error}</span>
              <button onClick={() => setError(null)} className="rounded-full p-0.5 hover:bg-white/10" aria-label="Dismiss"><Icon name="x" /></button>
            </div>
          </div>
        )}

        <main>
          {tab === 'tables' && <TablesView />}
          {tab === 'players' && <PlayersView />}
          {tab === 'khata' && <KhataView />}
          {tab === 'settings' && (
            <SettingsView
              account={account}
              auth={auth}
              onLogout={onLogout}
              onSelectOrg={selectOrg}
              onBranchAdded={() => void reload()}
            />
          )}
        </main>

        <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-stone-900/5 bg-white/90 pb-[env(safe-area-inset-bottom)] backdrop-blur">
          <div className="mx-auto grid max-w-md" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
            {tabs.map(([id, label, icon]) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`relative flex flex-col items-center gap-0.5 py-2.5 text-xs font-bold transition ${tab === id ? 'text-felt-700' : 'text-stone-400 hover:text-stone-600'}`}
              >
                <span className={`rounded-full px-4 py-1 transition ${tab === id ? 'bg-felt-100' : ''}`}><Icon name={icon} className="h-5 w-5" /></span>
                {label}
                {id === 'players' && s.openVisits.length > 0 && (
                  <span className="absolute left-1/2 top-1 ml-3 grid h-5 min-w-5 place-items-center rounded-full bg-red-600 px-1 text-[10px] text-white">{s.openVisits.length}</span>
                )}
              </button>
            ))}
          </div>
        </nav>
      </div>
    </CounterContext.Provider>
  )
}
