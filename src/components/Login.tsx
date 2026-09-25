import { useState, type FormEvent } from 'react'
import { isValidPin, normalizePhone } from '../lib/permissions'
import type { Account, AuthApi } from '../data/types'
import { Icon, Wordmark } from './icons'
import { Button, Input } from './ui'

export function PinInput(props: { value: string; onChange: (v: string) => void; placeholder?: string; autoComplete?: string }) {
  return (
    <Input
      type="password"
      inputMode="numeric"
      autoComplete={props.autoComplete ?? 'current-password'}
      maxLength={6}
      placeholder={props.placeholder ?? 'PIN (4–6 digits)'}
      value={props.value}
      onChange={(e) => props.onChange(e.target.value.replace(/\D/g, ''))}
      className="tracking-[0.4em] placeholder:tracking-normal"
    />
  )
}

export function PhoneInput(props: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <Input
      type="tel"
      inputMode="tel"
      autoComplete="tel"
      placeholder={props.placeholder ?? 'Mobile number'}
      value={props.value}
      onChange={(e) => props.onChange(e.target.value)}
    />
  )
}

export type AuthMode = 'login' | 'register'

export function AuthScreen({ auth, demo, initialMode = 'login', onBack, onLoggedIn }: {
  auth: AuthApi
  demo: boolean
  initialMode?: AuthMode
  /** Back to the landing page. */
  onBack?: () => void
  onLoggedIn: (account: Account) => void
}) {
  const [mode, setMode] = useState<AuthMode>(initialMode)
  const [phone, setPhone] = useState('')
  const [pin, setPin] = useState('')
  const [pin2, setPin2] = useState('')
  const [business, setBusiness] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const phoneOk = normalizePhone(phone) !== null
  const canSubmit = mode === 'login'
    ? phoneOk && isValidPin(pin)
    : phoneOk && isValidPin(pin) && pin === pin2 && business.trim() !== '' && name.trim() !== ''

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      onLoggedIn(mode === 'login'
        ? await auth.login(phone, pin)
        : await auth.register(business, name, phone, pin))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <aside className="felt relative hidden flex-col justify-between overflow-hidden p-10 text-white lg:flex">
        <Wordmark light />
        <div>
          <h2 className="text-4xl font-extrabold leading-tight tracking-tight">
            Every frame timed.<br />Every rupee on the <span className="text-brass-300">right bill.</span>
          </h2>
          <div className="mt-8 flex gap-3">
            {['stopwatch', 'trophy', 'phone'].map((a) => <img key={a} src={`/art/${a}.png`} alt="" className="h-14 w-14" />)}
          </div>
        </div>
        <p className="text-sm text-white/50">Staff: ask your shop admin to add your mobile number.</p>
      </aside>

      <main className="flex flex-col px-4 pb-8 pt-[max(1rem,env(safe-area-inset-top))] sm:px-8">
        <div className="flex items-center justify-between py-2">
          <span className="lg:invisible"><Wordmark /></span>
          {onBack && (
            <button onClick={onBack} className="rounded-lg px-3 py-2 text-sm font-semibold text-stone-500 hover:bg-stone-900/5">About the app</button>
          )}
        </div>

        <form onSubmit={submit} className="rise m-auto grid w-full max-w-sm gap-3 py-8">
          <div className="mb-2">
            <h1 className="text-3xl font-extrabold tracking-tight text-felt-950">
              {mode === 'login' ? 'Welcome back' : 'Create your business'}
            </h1>
            <p className="mt-1 text-stone-500">
              {mode === 'login' ? 'Log in with your mobile number and PIN.' : 'You will be the admin. Add staff after this.'}
            </p>
          </div>

          {demo && (
            <p className="rounded-2xl bg-amber-100 p-3 text-xs text-amber-900">
              <b>Demo mode.</b> Everything is saved only in this browser. Register a business once, then log in as you or your staff.
            </p>
          )}

          <div className="grid grid-cols-2 rounded-2xl bg-stone-900/5 p-1 text-sm font-bold">
            {(['login', 'register'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => { setMode(m); setError(null) }}
                className={`rounded-xl py-2.5 transition ${mode === m ? 'bg-white text-felt-900 shadow-sm' : 'text-stone-500'}`}
              >
                {m === 'login' ? 'Log in' : 'New business'}
              </button>
            ))}
          </div>

          {mode === 'register' && (
            <>
              <Input placeholder="Business name, e.g. Sharma Snooker" value={business} onChange={(e) => setBusiness(e.target.value)} />
              <Input placeholder="Your name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
            </>
          )}
          <PhoneInput value={phone} onChange={setPhone} />
          <PinInput value={pin} onChange={setPin} autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            placeholder={mode === 'login' ? 'PIN' : 'Choose a PIN (4–6 digits)'} />
          {mode === 'register' && <PinInput value={pin2} onChange={setPin2} autoComplete="new-password" placeholder="Repeat PIN" />}
          {mode === 'register' && pin2 !== '' && pin !== pin2 && <p className="text-sm text-amber-700">PINs don’t match</p>}

          {error && (
            <p role="alert" className="flex items-start gap-2 rounded-xl bg-red-50 p-3 text-sm font-medium text-red-800">
              <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />{error}
            </p>
          )}
          <Button type="submit" className="py-3 text-base" disabled={busy || !canSubmit}>
            {busy ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Create business'}
            {!busy && <Icon name="arrowRight" className="h-4 w-4" />}
          </Button>
          <p className="text-center text-xs text-stone-500 lg:hidden">Staff: ask your shop admin to add your mobile number.</p>
        </form>
      </main>
    </div>
  )
}
