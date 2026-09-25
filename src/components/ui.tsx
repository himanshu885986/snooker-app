import { useEffect, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react'
import { Icon } from './icons'

type Variant = 'primary' | 'secondary' | 'danger' | 'warning' | 'ghost' | 'brass' | 'glass'

const variants: Record<Variant, string> = {
  primary: 'bg-felt-800 text-white shadow-sm shadow-felt-900/20 hover:bg-felt-900',
  secondary: 'bg-white text-stone-800 ring-1 ring-inset ring-stone-300 hover:bg-stone-50',
  danger: 'bg-red-700 text-white shadow-sm hover:bg-red-800',
  warning: 'bg-amber-400 text-stone-900 shadow-sm hover:bg-amber-500',
  ghost: 'text-stone-600 hover:bg-stone-900/5',
  brass: 'bg-brass-400 text-felt-950 shadow-sm shadow-brass-700/30 hover:bg-brass-300',
  /** For use on dark felt backgrounds. */
  glass: 'bg-white/10 text-white ring-1 ring-inset ring-white/20 hover:bg-white/20',
}

export function Button({ variant = 'primary', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 font-semibold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 ${variants[variant]} ${className}`}
    />
  )
}

export function Input({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-base outline-none transition placeholder:text-stone-400 focus:border-felt-600 focus:ring-4 focus:ring-felt-600/15 ${className}`}
    />
  )
}

export function Select({ className = '', ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`rounded-xl border border-stone-300 bg-white px-3 py-2.5 outline-none focus:border-felt-600 focus:ring-4 focus:ring-felt-600/15 ${className}`}
    />
  )
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-felt-950/50 backdrop-blur-[2px] sm:items-start sm:p-4 sm:pt-[8vh]" onClick={onClose}>
      <div
        role="dialog"
        aria-label={title}
        className="rise max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-chalk p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 className="text-xl font-extrabold tracking-tight text-felt-950">{title}</h2>
          <button onClick={onClose} className="rounded-full p-2 text-stone-500 hover:bg-stone-900/5" aria-label="Close">
            <Icon name="x" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Card({ className = '', children }: { className?: string; children: ReactNode }) {
  return <div className={`rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-900/5 ${className}`}>{children}</div>
}

const avatarColors = ['bg-sky-100 text-sky-800', 'bg-violet-100 text-violet-800', 'bg-amber-100 text-amber-800', 'bg-rose-100 text-rose-800', 'bg-teal-100 text-teal-800', 'bg-lime-100 text-lime-800']

/** Round initials badge; the colour stays the same for the same name. */
export function Avatar({ name, className = 'h-10 w-10 text-sm' }: { name: string; className?: string }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('')
  let hash = 0
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) | 0
  return (
    <span className={`inline-grid shrink-0 place-items-center rounded-full font-bold ${avatarColors[Math.abs(hash) % avatarColors.length]} ${className}`}>
      {initials || '?'}
    </span>
  )
}
