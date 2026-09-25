import type { ReactNode } from 'react'
import type { PaymentMode } from '../data/types'
import { Icon } from './icons'
import { Input } from './ui'

/** Rupee amount box ("87.5" → the caller parses it with parseRupees). */
export function AmountInput({ value, onChange, placeholder = '0', autoFocus }: {
  value: string; onChange: (v: string) => void; placeholder?: string; autoFocus?: boolean
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-extrabold text-stone-400">₹</span>
      <Input
        autoFocus={autoFocus}
        inputMode="decimal"
        className="tabular pl-10 text-2xl font-extrabold"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ''))}
        aria-label="Amount in rupees"
      />
    </div>
  )
}

export function ModePicker({ value, onChange }: { value: PaymentMode; onChange: (m: PaymentMode) => void }) {
  return (
    <div className="grid grid-cols-2 gap-1 rounded-2xl bg-stone-900/5 p-1 text-sm font-bold" role="radiogroup" aria-label="Paid by">
      {(['cash', 'upi'] as const).map((m) => (
        <button
          key={m}
          type="button"
          role="radio"
          aria-checked={value === m}
          onClick={() => onChange(m)}
          className={`flex items-center justify-center gap-2 rounded-xl py-2.5 transition ${value === m ? 'bg-white text-felt-900 shadow-sm' : 'text-stone-500'}`}
        >
          <Icon name={m === 'cash' ? 'cash' : 'qr'} className="h-4 w-4" /> {m === 'cash' ? 'Cash' : 'UPI'}
        </button>
      ))}
    </div>
  )
}

const badgeStyles = {
  cash: 'bg-felt-100 text-felt-800',
  upi: 'bg-brass-100 text-brass-700',
  khata: 'bg-rose-100 text-rose-800',
}

export function MoneyBadge({ kind, children }: { kind: 'cash' | 'upi' | 'khata'; children: ReactNode }) {
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${badgeStyles[kind]}`}>{children}</span>
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}
