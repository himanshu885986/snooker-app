import { useMemo, useState } from 'react'
import { useCounter, useNow } from '../counter'
import { billableMinutes, billableSeconds, formatDuration, formatRupees, frameAmount, splitAmount } from '../lib/billing'
import type { ActiveFrame, Side, Table } from '../data/types'
import { Icon } from './icons'
import { Avatar, Button, Input, Modal } from './ui'

/** Warn staff when a table has been paused this long — they may have forgotten to resume. */
const LONG_PAUSE_MS = 10 * 60_000

const sideStyle: Record<Side, { chip: string; ring: string; solid: string; soft: string }> = {
  A: { chip: 'bg-sky-400/20 text-sky-100', ring: 'ring-sky-500', solid: 'bg-sky-600 text-white ring-sky-600', soft: 'bg-sky-50 ring-sky-200' },
  B: { chip: 'bg-violet-400/20 text-violet-100', ring: 'ring-violet-500', solid: 'bg-violet-600 text-white ring-violet-600', soft: 'bg-violet-50 ring-violet-200' },
}

export function TablesView() {
  const { state } = useCounter()
  const [starting, setStarting] = useState<Table | null>(null)
  const [ending, setEnding] = useState<ActiveFrame | null>(null)
  const [adjusting, setAdjusting] = useState<ActiveFrame | null>(null)

  if (state.tables.length === 0) {
    return <p className="p-10 text-center text-stone-500">No tables yet. The admin can add them in Settings.</p>
  }

  return (
    <div className="mx-auto max-w-6xl p-3 sm:p-4">
      <Summary />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
        {state.tables.map((table) => {
          const frame = state.activeFrames.find((f) => f.table_id === table.id)
          return frame
            ? <BusyTable key={table.id} table={table} frame={frame} onEnd={() => setEnding(frame)} onAdjust={() => setAdjusting(frame)} />
            : <FreeTable key={table.id} table={table} onStart={() => setStarting(table)} />
        })}
      </div>
      {starting && <StartFrameDialog table={starting} onClose={() => setStarting(null)} />}
      {ending && <EndFrameDialog frameId={ending.id} onClose={() => setEnding(null)} />}
      {adjusting && <AdjustTimeDialog frameId={adjusting.id} onClose={() => setAdjusting(null)} />}
    </div>
  )
}

function Summary() {
  const { state } = useCounter()
  const now = useNow()
  const running = state.activeFrames.reduce(
    (sum, f) => sum + frameAmount(billableSeconds(f.started_at, f.pauses, now), f.rate_paise_per_min), 0)
  const stats = [
    { label: 'Tables in play', value: `${state.activeFrames.length}/${state.tables.length}` },
    { label: 'Running on tables', value: formatRupees(running) },
    { label: 'Players in shop', value: String(state.openVisits.length) },
  ]
  return (
    <div className="mb-4 grid grid-cols-3 gap-2 sm:gap-3">
      {stats.map((s) => (
        <div key={s.label} className="rounded-2xl bg-white px-3 py-2.5 shadow-sm ring-1 ring-stone-900/5">
          <p className="tabular text-lg font-extrabold text-felt-900 sm:text-2xl">{s.value}</p>
          <p className="text-[11px] font-medium text-stone-500 sm:text-xs">{s.label}</p>
        </div>
      ))}
    </div>
  )
}

function FreeTable({ table, onStart }: { table: Table; onStart: () => void }) {
  const { can } = useCounter()
  return (
    <div className="flex flex-col rounded-3xl bg-white p-4 shadow-sm ring-1 ring-stone-900/5">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-extrabold tracking-tight">{table.name}</h3>
        <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-semibold text-stone-600">{formatRupees(table.rate_paise_per_min)}/min</span>
      </div>
      <TableDrawing />
      <div className="mt-auto flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-sm font-semibold text-felt-600">
          <span className="h-2 w-2 rounded-full bg-felt-500" /> Free
        </span>
        {can('operate') && (
          <Button onClick={onStart} className="flex-1 sm:flex-none"><Icon name="play" className="h-4 w-4" /> Start frame</Button>
        )}
      </div>
    </div>
  )
}

/** Small empty-table picture for free tables. */
function TableDrawing() {
  return (
    <div className="my-4 rounded-2xl bg-[#7a4a2a] p-1.5 shadow-inner">
      <div className="relative h-16 rounded-xl bg-felt-600/90">
        {['left-0 top-0', 'left-1/2 top-0 -translate-x-1/2', 'right-0 top-0', 'left-0 bottom-0', 'left-1/2 bottom-0 -translate-x-1/2', 'right-0 bottom-0'].map((pos) => (
          <span key={pos} className={`absolute h-2.5 w-2.5 rounded-full bg-felt-950 ${pos}`} />
        ))}
        <span className="absolute left-[22%] top-0 h-full w-px bg-white/25" />
      </div>
    </div>
  )
}

function useFrameLive(frame: ActiveFrame) {
  const now = useNow()
  const seconds = billableSeconds(frame.started_at, frame.pauses, now)
  const openPause = frame.pauses.find((p) => !p.resumed_at)
  return {
    seconds,
    amount: frameAmount(seconds, frame.rate_paise_per_min),
    pausedFor: openPause ? now - Date.parse(openPause.paused_at) : 0,
  }
}

function usePlayerNames() {
  const { state } = useCounter()
  return useMemo(() => {
    const names = new Map(state.openVisits.map((v) => [v.id, v.player_name]))
    return (frame: ActiveFrame, side: Side) =>
      frame.players.filter((p) => p.side === side).map((p) => names.get(p.visit_id) ?? '?')
  }, [state.openVisits])
}

function BusyTable({ table, frame, onEnd, onAdjust }: { table: Table; frame: ActiveFrame; onEnd: () => void; onAdjust: () => void }) {
  const { store, run, busy, can } = useCounter()
  const { seconds, amount, pausedFor } = useFrameLive(frame)
  const namesOf = usePlayerNames()
  const paused = frame.status === 'paused'
  const longPause = paused && pausedFor > LONG_PAUSE_MS

  return (
    <div className={`felt relative flex flex-col overflow-hidden rounded-3xl p-4 text-white shadow-lg shadow-felt-950/20 ring-4 ${paused ? 'ring-amber-400' : 'ring-[#7a4a2a]'}`}>
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-extrabold tracking-tight">{table.name}</h3>
        {paused
          ? <span className="rounded-full bg-amber-400 px-2.5 py-1 text-xs font-bold text-stone-900">PAUSED</span>
          : <span className="flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-xs font-semibold"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-400" /> In play</span>}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5 text-sm font-semibold">
        <span className={`rounded-full px-2.5 py-1 ${sideStyle.A.chip}`}>{namesOf(frame, 'A').join(' & ')}</span>
        <span className="text-xs text-white/50">vs</span>
        <span className={`rounded-full px-2.5 py-1 ${sideStyle.B.chip}`}>{namesOf(frame, 'B').join(' & ')}</span>
      </div>

      <div className="my-4 flex items-end justify-between gap-2">
        <span className={`tabular text-5xl font-extrabold tracking-tight ${paused ? 'text-amber-300' : ''}`}>{formatDuration(seconds)}</span>
        <span className="text-right">
          <span className="tabular block text-2xl font-extrabold text-brass-300">{formatRupees(amount)}</span>
          <span className="block text-xs text-white/60">{formatRupees(frame.rate_paise_per_min)}/min</span>
        </span>
      </div>

      {paused && (
        <p className={`mb-3 flex items-center gap-1.5 text-sm font-semibold ${longPause ? 'text-red-300' : 'text-amber-200'}`}>
          {longPause && <Icon name="alert" className="h-4 w-4" />}
          {pausedFor < 60_000 ? 'Paused just now' : `Paused ${Math.floor(pausedFor / 60_000)} min`}{longPause ? ' — forgot to resume?' : ''}
        </p>
      )}
      {frame.time_adjusted && (
        <p className="mb-3 flex items-center gap-1.5 text-xs text-white/60"><Icon name="pencil" className="h-3.5 w-3.5" /> Time adjusted by admin</p>
      )}

      {can('operate') && (
        <div className="mt-auto grid grid-cols-2 gap-2">
          {paused
            ? <Button variant="warning" disabled={busy} onClick={() => run(() => store.resumeFrame(frame.id))}><Icon name="play" className="h-4 w-4" /> Resume</Button>
            : <Button variant="glass" disabled={busy} onClick={() => run(() => store.pauseFrame(frame.id))}><Icon name="pause" className="h-4 w-4" /> Pause</Button>}
          <Button variant="brass" disabled={busy} onClick={onEnd}><Icon name="flag" className="h-4 w-4" /> End frame</Button>
          {can('adjust') && (
            <button disabled={busy} onClick={onAdjust}
              className="col-span-2 flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-sm font-medium text-white/70 hover:bg-white/10 hover:text-white">
              <Icon name="pencil" className="h-4 w-4" /> Adjust time
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function StartFrameDialog({ table, onClose }: { table: Table; onClose: () => void }) {
  const { store, state, run, busy } = useCounter()
  const [sideA, setSideA] = useState<string[]>([])
  const [sideB, setSideB] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [newName, setNewName] = useState('')
  const [newPhone, setNewPhone] = useState('')

  const playing = new Set(state.activeFrames.flatMap((f) => f.players.map((p) => p.visit_id)))
  const available = state.openVisits.filter((v) =>
    !playing.has(v.id) && v.player_name.toLowerCase().includes(search.trim().toLowerCase()))

  const sideOf = (id: string): Side | null => sideA.includes(id) ? 'A' : sideB.includes(id) ? 'B' : null
  const assign = (id: string, side: Side) => {
    const current = sideOf(id)
    setSideA((a) => a.filter((x) => x !== id))
    setSideB((b) => b.filter((x) => x !== id))
    if (current === side) return // tapping the same side again removes the player
    if (side === 'A') setSideA((a) => (a.length < 2 ? [...a, id] : a))
    else setSideB((b) => (b.length < 2 ? [...b, id] : b))
  }

  async function addNewPlayer(side: Side) {
    let id = ''
    const ok = await run(async () => {
      id = await store.openVisit(state.branch.id, { player_name: newName, phone: newPhone || null })
    })
    if (!ok) return
    assign(id, side)
    setNewName('')
    setNewPhone('')
  }

  const nameOf = (id: string) => state.openVisits.find((v) => v.id === id)?.player_name ?? ''
  const sideFull = (side: Side) => (side === 'A' ? sideA : sideB).length >= 2
  const canStart = sideA.length >= 1 && sideB.length >= 1

  return (
    <Modal title={`Start frame · ${table.name}`} onClose={onClose}>
      <div className="mb-4 grid grid-cols-[1fr_auto_1fr] items-stretch gap-2">
        {(['A', 'B'] as const).map((side, i) => {
          const ids = side === 'A' ? sideA : sideB
          return [
            i === 1 && <span key="vs" className="self-center text-xs font-bold text-stone-400">VS</span>,
            <div key={side} className={`rounded-2xl p-3 ring-2 ${sideStyle[side].soft}`}>
              <p className="text-[11px] font-bold uppercase tracking-wider text-stone-500">Side {side}</p>
              <div className="mt-1 min-h-12 space-y-1">
                {ids.length
                  ? ids.map((id) => <p key={id} className="flex items-center gap-2 font-semibold"><Avatar name={nameOf(id)} className="h-6 w-6 text-[10px]" />{nameOf(id)}</p>)
                  : <p className="text-sm text-stone-400">Pick 1–2 players</p>}
              </div>
            </div>,
          ]
        })}
      </div>

      <div className="mb-4 rounded-2xl bg-white p-3 ring-1 ring-stone-900/5">
        <p className="mb-2 text-sm font-bold">New player</p>
        <div className="grid grid-cols-2 gap-2">
          <Input placeholder="Name" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <Input placeholder="Phone (optional)" inputMode="tel" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} />
          <Button variant="secondary" disabled={busy || !newName.trim() || sideFull('A')} onClick={() => addNewPlayer('A')}><Icon name="plus" className="h-4 w-4" /> Side A</Button>
          <Button variant="secondary" disabled={busy || !newName.trim() || sideFull('B')} onClick={() => addNewPlayer('B')}><Icon name="plus" className="h-4 w-4" /> Side B</Button>
        </div>
      </div>

      <p className="mb-2 text-sm font-bold">Players already in the shop</p>
      {state.openVisits.length > 6 && (
        <div className="relative mb-2">
          <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
          <Input className="pl-9" placeholder="Search" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      )}
      {available.length === 0 && <p className="mb-3 text-sm text-stone-500">Nobody waiting. Add new players above.</p>}
      <ul hidden={available.length === 0} className="mb-4 divide-y divide-stone-100 overflow-hidden rounded-2xl bg-white ring-1 ring-stone-900/5">
        {available.map((v) => {
          const side = sideOf(v.id)
          return (
            <li key={v.id} className="flex items-center justify-between gap-2 px-3 py-2">
              <span className="flex items-center gap-2.5 font-medium"><Avatar name={v.player_name} className="h-8 w-8 text-xs" />{v.player_name}</span>
              <span className="flex gap-1.5">
                {(['A', 'B'] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => assign(v.id, s)}
                    disabled={side !== s && sideFull(s)}
                    className={`h-9 w-11 rounded-lg text-sm font-bold ring-1 ring-inset transition disabled:opacity-30 ${side === s ? sideStyle[s].solid : 'bg-white ring-stone-300 hover:bg-stone-50'}`}
                  >
                    {s}
                  </button>
                ))}
              </span>
            </li>
          )
        })}
      </ul>

      <Button
        className="w-full py-3.5 text-lg"
        disabled={busy || !canStart}
        onClick={async () => { if (await run(() => store.startFrame(table.id, sideA, sideB))) onClose() }}
      >
        <Icon name="play" /> Start timer · {formatRupees(table.rate_paise_per_min)}/min
      </Button>
    </Modal>
  )
}

function EndFrameDialog({ frameId, onClose }: { frameId: string; onClose: () => void }) {
  const { state } = useCounter()
  const frame = state.activeFrames.find((f) => f.id === frameId)
  if (!frame) return null // already ended on another device
  const tableName = state.tables.find((t) => t.id === frame.table_id)?.name ?? ''
  return <EndFrameBody frame={frame} tableName={tableName} onClose={onClose} />
}

function EndFrameBody({ frame, tableName, onClose }: { frame: ActiveFrame; tableName: string; onClose: () => void }) {
  const { store, run, busy, can } = useCounter()
  const { seconds, amount } = useFrameLive(frame)
  const namesOf = usePlayerNames()
  const [confirmCancel, setConfirmCancel] = useState(false)

  const end = async (side: Side) => { if (await run(() => store.endFrame(frame.id, side))) onClose() }

  return (
    <Modal title={`End frame · ${tableName}`} onClose={onClose}>
      <div className="felt mb-4 rounded-2xl p-4 text-center text-white">
        <p className="tabular text-4xl font-extrabold">{formatDuration(seconds)}</p>
        <p className="mt-1 text-sm text-white/70">
          {billableMinutes(seconds)} min × {formatRupees(frame.rate_paise_per_min)} = <b className="text-brass-300">{formatRupees(amount)}</b>
        </p>
      </div>

      <p className="mb-2 font-bold">Who lost? They pay for this frame.</p>
      <div className="mb-4 grid gap-2">
        {(['A', 'B'] as const).map((side) => {
          const names = namesOf(frame, side)
          const shares = splitAmount(amount, names.length)
          return (
            <button
              key={side}
              disabled={busy}
              onClick={() => end(side)}
              className={`rounded-2xl p-4 text-left ring-2 transition hover:brightness-[0.97] active:scale-[0.99] disabled:opacity-50 ${sideStyle[side].soft}`}
            >
              <span className="block text-[11px] font-bold uppercase tracking-wider text-stone-500">Side {side} lost</span>
              <span className="mt-1 block text-lg font-extrabold">{names.join(' & ')}</span>
              <span className="mt-1 flex flex-wrap gap-x-3 text-sm text-stone-600">
                {names.map((n, i) => <span key={n + i}>{n} pays <b className="text-stone-900">{formatRupees(shares[i])}</b></span>)}
              </span>
            </button>
          )
        })}
      </div>

      {!can('adjust') ? null : confirmCancel ? (
        <div className="rounded-2xl bg-red-50 p-3 ring-1 ring-red-200">
          <p className="mb-2 text-sm">Cancel this frame? <b>Nobody will be charged</b> for it.</p>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => setConfirmCancel(false)}>Keep frame</Button>
            <Button variant="danger" disabled={busy} onClick={async () => { if (await run(() => store.cancelFrame(frame.id))) onClose() }}>Yes, cancel</Button>
          </div>
        </div>
      ) : (
        <Button variant="ghost" className="w-full text-sm" onClick={() => setConfirmCancel(true)}>Started by mistake? Cancel without charge</Button>
      )}
    </Modal>
  )
}

function AdjustTimeDialog({ frameId, onClose }: { frameId: string; onClose: () => void }) {
  const { state } = useCounter()
  const frame = state.activeFrames.find((f) => f.id === frameId)
  if (!frame) return null // ended meanwhile
  const tableName = state.tables.find((t) => t.id === frame.table_id)?.name ?? ''
  return <AdjustTimeBody frame={frame} tableName={tableName} onClose={onClose} />
}

function AdjustTimeBody({ frame, tableName, onClose }: { frame: ActiveFrame; tableName: string; onClose: () => void }) {
  const { store, run, busy } = useCounter()
  const { seconds } = useFrameLive(frame)
  const [minutes, setMinutes] = useState(() => String(Math.floor(seconds / 60)))
  const value = Number(minutes)
  const valid = minutes.trim() !== '' && Number.isInteger(value) && value >= 0 && value <= 24 * 60
  const nudge = (delta: number) => setMinutes(String(Math.max(0, (valid ? value : 0) + delta)))

  return (
    <Modal title={`Adjust time · ${tableName}`} onClose={onClose}>
      <p className="mb-4 text-sm text-stone-600">
        Timer shows <b className="tabular">{formatDuration(seconds)}</b>. Set how many minutes have really been played,
        for example if the timer was started late. The change is recorded.
      </p>
      <div className="mb-4 flex items-center gap-2">
        <Button variant="secondary" className="px-3" onClick={() => nudge(-5)}>−5</Button>
        <Button variant="secondary" className="px-3" onClick={() => nudge(-1)}>−1</Button>
        <label className="flex flex-1 items-center gap-2">
          <Input inputMode="numeric" className="tabular text-center text-2xl font-extrabold" value={minutes}
            onChange={(e) => setMinutes(e.target.value.replace(/\D/g, ''))} aria-label="Minutes played" />
          <span className="text-sm text-stone-500">min</span>
        </label>
        <Button variant="secondary" className="px-3" onClick={() => nudge(1)}>+1</Button>
        <Button variant="secondary" className="px-3" onClick={() => nudge(5)}>+5</Button>
      </div>
      {valid && (
        <p className="mb-4 rounded-xl bg-white p-3 text-center text-sm text-stone-600 ring-1 ring-stone-900/5">
          Bill so far: {billableMinutes(value * 60)} min × {formatRupees(frame.rate_paise_per_min)} = <b className="text-stone-900">{formatRupees(frameAmount(value * 60, frame.rate_paise_per_min))}</b>
        </p>
      )}
      <Button className="w-full" disabled={busy || !valid}
        onClick={async () => { if (await run(() => store.adjustFrameTime(frame.id, value * 60))) onClose() }}>
        <Icon name="check" /> Save time
      </Button>
    </Modal>
  )
}
