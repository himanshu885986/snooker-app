import { createContext, useContext, useEffect, useState } from 'react'
import type { BranchState, DataStore } from './data/types'
import { can as roleCan, type Action } from './lib/permissions'

export interface Counter {
  store: DataStore
  state: BranchState
  /** Run a store action, showing any error to staff. Resolves to true on success. */
  run: (action: () => Promise<unknown>) => Promise<boolean>
  busy: boolean
  /** Whether the logged-in person's role allows this. */
  can: (action: Action) => boolean
}

export const CounterContext = createContext<Counter | null>(null)

export function useCounter(): Counter {
  const counter = useContext(CounterContext)
  if (!counter) throw new Error('useCounter must be used inside CounterContext')
  return counter
}

export function makeCan(state: BranchState) {
  return (action: Action) => roleCan(state.role, action)
}

/** Current time, updated every second, for live timers. */
export function useNow(): number {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  return now
}
