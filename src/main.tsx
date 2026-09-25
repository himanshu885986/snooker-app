import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { createClient } from '@supabase/supabase-js'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import { App } from './App'
import { AuthScreen, type AuthMode } from './components/Login'
import { Landing } from './components/Landing'
import { Button } from './components/ui'
import { createLocalStore } from './data/localStore'
import { createSupabaseAuth } from './data/supabaseAuth'
import { createSupabaseStore } from './data/supabaseStore'
import type { Account, AuthApi, DataStore } from './data/types'

registerSW({ immediate: true })

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

function backend(): { store: DataStore; auth: AuthApi } {
  if (url && key) {
    const client = createClient(url, key)
    return { store: createSupabaseStore(client), auth: createSupabaseAuth(client) }
  }
  const store = createLocalStore(localStorage)
  return { store, auth: store.auth }
}

const { store, auth } = backend()

/** Set once someone logs in here, so a shop's counter tablet opens on the login screen, not the landing page. */
const USED_KEY = 'snooker-device-used'

function deviceUsed(): boolean {
  try { return localStorage.getItem(USED_KEY) === '1' } catch { return false }
}

function Root() {
  const [account, setAccount] = useState<Account | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [screen, setScreen] = useState<'landing' | AuthMode>(() => deviceUsed() ? 'login' : 'landing')

  const loggedIn = (a: Account) => {
    try { localStorage.setItem(USED_KEY, '1') } catch { /* private mode */ }
    setAccount(a)
  }

  useEffect(() => {
    auth.whoami().then(setAccount, (e: Error) => setError(e.message))
  }, [])

  const logout = async () => {
    await auth.logout()
    setScreen('login')
    setAccount(null)
  }

  if (error) {
    return (
      <div className="grid min-h-screen place-items-center p-6 text-center">
        <div>
          <p className="mb-3 font-semibold text-red-700">{error}</p>
          <Button variant="secondary" onClick={() => location.reload()}>Try again</Button>
        </div>
      </div>
    )
  }
  if (account === undefined) return null
  if (!account) {
    if (screen === 'landing') {
      const go = (next: AuthMode) => { setScreen(next); window.scrollTo(0, 0) }
      return <Landing onLogin={() => go('login')} onRegister={() => go('register')} />
    }
    return (
      <AuthScreen key={screen} auth={auth} demo={store.mode === 'demo'} initialMode={screen}
        onBack={() => { setScreen('landing'); window.scrollTo(0, 0) }} onLoggedIn={loggedIn} />
    )
  }
  if (account.memberships.length === 0) {
    return (
      <div className="grid min-h-screen place-items-center p-6 text-center">
        <div className="max-w-sm">
          <p className="mb-2 text-lg font-bold">Hi {account.name}</p>
          <p className="mb-4 text-stone-600">You’re not part of any business right now. Ask the shop admin to add your number ({account.phone}).</p>
          <Button variant="secondary" onClick={logout}>Log out</Button>
        </div>
      </div>
    )
  }
  return <App store={store} account={account} auth={auth} onLogout={logout} />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
