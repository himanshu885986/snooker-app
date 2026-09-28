import { useMemo, useState, type ReactNode } from 'react'
import { useCounter, useNow } from '../counter'
import { billableSeconds, billedMinutes, formatDuration, formatMinutes, formatRate, formatRupees, frameAmount, playedMinutes, splitAmount } from '../lib/billing'
import { gameImage, games, nounFor } from '../lib/games'
import type { ActiveFrame, Side, Table } from '../data/types'
import { Icon } from './icons'
import { Avatar, Button, Input, Modal } from './ui'

/** Warn staff when a table has been paused this long — they may have forgotten to resume. */
const LONG_PAUSE_MS = 10 * 60_000
const MAX_SPLIT_PLAYERS = 8

const sideStyle: Record<Side, { chip: string; ring: string; solid: string; soft: string }> = {
  A: { chip: 'bg-sky-400/20 text-sky-100', ring: 'ring-sky-500', solid: 'bg-sky-600 text-white ring-sky-600', soft: 'bg-sky-50 ring-sky-200' },
  B: { chip: 'bg-violet-400/20 text-violet-100', ring: 'ring-violet-500', solid: 'bg-violet-600 text-white ring-violet-600', soft: 'bg-violet-50 ring-violet-200' },
}

/** Rate of a running frame, shown in its table's unit. */
const frameRate = (frame: ActiveFrame, table: Table) => formatRate({ rate_paise_per_hour: frame.rate_paise_per_hour, rate_unit: table.rate_unit })
const capitalize = (s: string) => s[0].toUpperCase() + s.slice(1)

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
  const running = state.activeFrames.reduce((sum, f) => sum + frameAmount(billableSeconds(f.started_at, f.pauses, now), f), 0)
  const stats = [
    { label: 'In play', value: `${state.activeFrames.length}/${state.tables.length}` },
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

function TableTitle({ table }: { table: Table }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <img src={gameImage(table.kind)} alt="" className="h-7 w-7 shrink-0" />
      <h3 className="truncate text-lg font-extrabold tracking-tight">{table.name}</h3>
    </span>
  )
}

function FreeTable({ table, onStart }: { table: Table; onStart: () => void }) {
  const { can } = useCounter()
  const cue = table.kind === 'snooker' || table.kind === 'pool'
  return (
    <div className="flex flex-col rounded-3xl bg-white p-4 shadow-sm ring-1 ring-stone-900/5">
      <div className="flex items-center justify-between gap-2">
        <TableTitle table={table} />
        <span className="shrink-0 rounded-full bg-stone-100 px-2.5 py-1 text-xs font-semibold text-stone-600">{formatRate(table)}</span>
      </div>
      {cue ? <TableDrawing /> : (
        <div className="my-4 flex h-[4.75rem] items-center justify-center gap-3 rounded-2xl bg-chalk">
          <img src={gameImage(table.kind)} alt="" className="h-12 w-12" />
          <span className="text-sm font-semibold text-stone-500">
            {games[table.kind].label}
            {table.min_minutes > 1 && <span className="block text-xs font-normal">min {formatMinutes(table.min_minutes)}</span>}
          </span>
        </div>
      )}
      <div className="mt-auto flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-sm font-semibold text-felt-600">
          <span className="h-2 w-2 rounded-full bg-felt-500" /> Free
        </span>
        {can('operate') && (
          <Button onClick={onStart} className="flex-1 sm:flex-none"><Icon name="play" className="h-4 w-4" /> Start {nounFor(table)}</Button>
        )}
      </div>
    </div>
  )
}

/** Small empty-table picture for free snooker and pool tables. */
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
    amount: frameAmount(seconds, frame),
    pausedFor: openPause ? now - Date.parse(openPause.paused_at) : 0,
  }
}

function usePlayerNames() {
  const { state } = useCounter()
  return useMemo(() => {
    const names = new Map(state.openVisits.map((v) => [v.id, v.player_name]))
    const nameOf = (visitId: string) => names.get(visitId) ?? '?'
    return {
      nameOf,
      side: (frame: ActiveFrame, side: Side) => frame.players.filter((p) => p.side === side).map((p) => nameOf(p.visit_id)),
      all: (frame: ActiveFrame) => frame.players.map((p) => nameOf(p.visit_id)),
    }
  }, [state.openVisits])
}

function BusyTable({ table, frame, onEnd, onAdjust }: { table: Table; frame: ActiveFrame; onEnd: () => void; onAdjust: () => void }) {
  const { store, run, busy, can } = useCounter()
  const { seconds, amount, pausedFor } = useFrameLive(frame)
  const names = usePlayerNames()
  const paused = frame.status === 'paused'
  const longPause = paused && pausedFor > LONG_PAUSE_MS
  const noun = nounFor(table)

  return (
    <div className={`felt relative flex flex-col overflow-hidden rounded-3xl p-4 text-white shadow-lg shadow-felt-950/20 ring-4 ${paused ? 'ring-amber-400' : 'ring-[#7a4a2a]'}`}>
      <div className="flex items-center justify-between gap-2">
        <TableTitle table={table} />
        {paused
          ? <span className="shrink-0 rounded-full bg-amber-400 px-2.5 py-1 text-xs font-bold text-stone-900">PAUSED</span>
          : <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-xs font-semibold"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-400" /> In play</span>}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5 text-sm font-semibold">
        {frame.billing === 'loser' ? (
          <>
            <span className={`rounded-full px-2.5 py-1 ${sideStyle.A.chip}`}>{names.side(frame, 'A').join(' & ')}</span>
            <span className="text-xs text-white/50">vs</span>
            <span className={`rounded-full px-2.5 py-1 ${sideStyle.B.chip}`}>{names.side(frame, 'B').join(' & ')}</span>
          </>
        ) : names.all(frame).map((n, i) => (
          <span key={n + i} className="rounded-full bg-white/10 px-2.5 py-1">{n}</span>
        ))}
      </div>

      <div className="my-4 flex items-end justify-between gap-2">
        <span className={`tabular text-5xl font-extrabold tracking-tight ${paused ? 'text-amber-300' : ''}`}>{formatDuration(seconds)}</span>
        <span className="text-right">
          <span className="tabular block text-2xl font-extrabold text-brass-300">{formatRupees(amount)}</span>
          <span className="block text-xs text-white/60">{frameRate(frame, table)}</span>
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
          <Button variant="brass" disabled={busy} onClick={onEnd}><Icon name="flag" className="h-4 w-4" /> End {noun}</Button>
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

/** Players in the shop who aren't playing right now, plus a "new player" form. */
function usePlayerPicker() {
  const { store, state, run } = useCounter()
  const [search, setSearch] = useState('')
  const [newName, setNewName] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const playing = new Set(state.activeFrames.flatMap((f) => f.players.map((p) => p.visit_id)))
  const available = state.openVisits.filter((v) =>
    !playing.has(v.id) && v.player_name.toLowerCase().includes(search.trim().toLowerCase()))

  /** Opens a bill for the new player; returns their id, or null if it failed. */
  async function addNew(): Promise<string | null> {
    let id = ''
    const ok = await run(async () => { id = await store.openVisit(state.branch.id, { player_name: newName, phone: newPhone || null }) })
    if (!ok) return null
    setNewName('')
    setNewPhone('')
    return id
  }

  const nameOf = (id: string) => state.openVisits.find((v) => v.id === id)?.player_name ?? ''
  return { search, setSearch, newName, setNewName, newPhone, setNewPhone, available, addNew, nameOf, showSearch: state.openVisits.length > 6 }
}

function NewPlayerFields({ picker, children }: { picker: ReturnType<typeof usePlayerPicker>; children: ReactNode }) {
  return (
    <div className="mb-4 rounded-2xl bg-white p-3 ring-1 ring-stone-900/5">
      <p className="mb-2 text-sm font-bold">New player</p>
      <div className="grid grid-cols-2 gap-2">
        <Input placeholder="Name" value={picker.newName} onChange={(e) => picker.setNewName(e.target.value)} />
        <Input placeholder="Phone (optional)" inputMode="tel" value={picker.newPhone} onChange={(e) => picker.setNewPhone(e.target.value)} />
        {children}
      </div>
    </div>
  )
}

function PlayerSearch({ picker }: { picker: ReturnType<typeof usePlayerPicker> }) {
  return (
    <>
      <p className="mb-2 text-sm font-bold">Players already in the shop</p>
      {picker.showSearch && (
        <div className="relative mb-2">
          <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
          <Input className="pl-9" placeholder="Search" value={picker.search} onChange={(e) => picker.setSearch(e.target.value)} />
        </div>
      )}
      {picker.available.length === 0 && <p className="mb-3 text-sm text-stone-500">Nobody waiting. Add new players above.</p>}
    </>
  )
}

function StartFrameDialog({ table, onClose }: { table: Table; onClose: () => void }) {
  return table.billing === 'loser'
    ? <StartSidesDialog table={table} onClose={onClose} />
    : <StartSplitDialog table={table} onClose={onClose} />
}

function StartSidesDialog({ table, onClose }: { table: Table; onClose: () => void }) {
  const { store, run, busy } = useCounter()
  const picker = usePlayerPicker()
  const [sideA, setSideA] = useState<string[]>([])
  const [sideB, setSideB] = useState<string[]>([])

  const sideOf = (id: string): Side | null => sideA.includes(id) ? 'A' : sideB.includes(id) ? 'B' : null
  const assign = (id: string, side: Side) => {
    const current = sideOf(id)
    setSideA((a) => a.filter((x) => x !== id))
    setSideB((b) => b.filter((x) => x !== id))
    if (current === side) return // tapping the same side again removes the player
    if (side === 'A') setSideA((a) => (a.length < 2 ? [...a, id] : a))
    else setSideB((b) => (b.length < 2 ? [...b, id] : b))
  }
  const addNewTo = async (side: Side) => { const id = await picker.addNew(); if (id) assign(id, side) }
  const sideFull = (side: Side) => (side === 'A' ? sideA : sideB).length >= 2

  return (
    <Modal title={`Start ${nounFor(table)} · ${table.name}`} onClose={onClose}>
      <div className="mb-4 grid grid-cols-[1fr_auto_1fr] items-stretch gap-2">
        {(['A', 'B'] as const).map((side, i) => {
          const ids = side === 'A' ? sideA : sideB
          return [
            i === 1 && <span key="vs" className="self-center text-xs font-bold text-stone-400">VS</span>,
            <div key={side} className={`rounded-2xl p-3 ring-2 ${sideStyle[side].soft}`}>
              <p className="text-[11px] font-bold uppercase tracking-wider text-stone-500">Side {side}</p>
              <div className="mt-1 min-h-12 space-y-1">
                {ids.length
                  ? ids.map((id) => <p key={id} className="flex items-center gap-2 font-semibold"><Avatar name={picker.nameOf(id)} className="h-6 w-6 text-[10px]" />{picker.nameOf(id)}</p>)
                  : <p className="text-sm text-stone-400">Pick 1–2 players</p>}
              </div>
            </div>,
          ]
        })}
      </div>

      <NewPlayerFields picker={picker}>
        <Button variant="secondary" disabled={busy || !picker.newName.trim() || sideFull('A')} onClick={() => addNewTo('A')}><Icon name="plus" className="h-4 w-4" /> Side A</Button>
        <Button variant="secondary" disabled={busy || !picker.newName.trim() || sideFull('B')} onClick={() => addNewTo('B')}><Icon name="plus" className="h-4 w-4" /> Side B</Button>
      </NewPlayerFields>

      <PlayerSearch picker={picker} />
      <ul hidden={picker.available.length === 0} className="mb-4 divide-y divide-stone-100 overflow-hidden rounded-2xl bg-white ring-1 ring-stone-900/5">
        {picker.available.map((v) => {
          const side = sideOf(v.id)
          return (
            <li key={v.id} className="flex items-center justify-between gap-2 px-3 py-2">
              <span className="flex items-center gap-2.5 font-medium"><Avatar name={v.player_name} className="h-8 w-8 text-xs" />{v.player_name}</span>
              <span className="flex gap-1.5">
                {(['A', 'B'] as const).map((s) => (
                  <button key={s} onClick={() => assign(v.id, s)} disabled={side !== s && sideFull(s)}
                    className={`h-9 w-11 rounded-lg text-sm font-bold ring-1 ring-inset transition disabled:opacity-30 ${side === s ? sideStyle[s].solid : 'bg-white ring-stone-300 hover:bg-stone-50'}`}>
                    {s}
                  </button>
                ))}
              </span>
            </li>
          )
        })}
      </ul>

      <Button className="w-full py-3.5 text-lg" disabled={busy || sideA.length < 1 || sideB.length < 1}
        onClick={async () => { if (await run(() => store.startFrame(table.id, sideA, sideB))) onClose() }}>
        <Icon name="play" /> Start timer · {formatRate(table)}
      </Button>
    </Modal>
  )
}

function StartSplitDialog({ table, onClose }: { table: Table; onClose: () => void }) {
  const { store, run, busy } = useCounter()
  const picker = usePlayerPicker()
  const [chosen, setChosen] = useState<string[]>([])
  const full = chosen.length >= MAX_SPLIT_PLAYERS
  const toggle = (id: string) => setChosen((c) => c.includes(id) ? c.filter((x) => x !== id) : full ? c : [...c, id])
  const addNew = async () => { const id = await picker.addNew(); if (id) setChosen((c) => [...c, id]) }

  return (
    <Modal title={`Start session · ${table.name}`} onClose={onClose}>
      <div className="mb-4 rounded-2xl bg-felt-50 p-3 ring-2 ring-felt-200">
        <p className="text-[11px] font-bold uppercase tracking-wider text-stone-500">Players ({chosen.length})</p>
        <div className="mt-1 flex min-h-9 flex-wrap gap-1.5">
          {chosen.length
            ? chosen.map((id) => (
              <button key={id} onClick={() => toggle(id)} className="flex items-center gap-1.5 rounded-full bg-white py-1 pl-1 pr-2.5 text-sm font-semibold ring-1 ring-felt-200">
                <Avatar name={picker.nameOf(id)} className="h-6 w-6 text-[10px]" />{picker.nameOf(id)}<Icon name="x" className="h-3.5 w-3.5 text-stone-400" />
              </button>
            ))
            : <p className="text-sm text-stone-400">Add who is playing. The bill is shared between them at the end.</p>}
        </div>
      </div>

      <NewPlayerFields picker={picker}>
        <Button variant="secondary" className="col-span-2" disabled={busy || !picker.newName.trim() || full} onClick={addNew}>
          <Icon name="plus" className="h-4 w-4" /> Add player
        </Button>
      </NewPlayerFields>

      <PlayerSearch picker={picker} />
      <ul hidden={picker.available.length === 0} className="mb-4 divide-y divide-stone-100 overflow-hidden rounded-2xl bg-white ring-1 ring-stone-900/5">
        {picker.available.map((v) => {
          const on = chosen.includes(v.id)
          return (
            <li key={v.id}>
              <button onClick={() => toggle(v.id)} disabled={!on && full}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left disabled:opacity-40">
                <span className="flex items-center gap-2.5 font-medium"><Avatar name={v.player_name} className="h-8 w-8 text-xs" />{v.player_name}</span>
                <span className={`grid h-7 w-7 place-items-center rounded-lg ring-1 ring-inset ${on ? 'bg-felt-700 text-white ring-felt-700' : 'ring-stone-300'}`}>
                  {on && <Icon name="check" className="h-4 w-4" />}
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      <Button className="w-full py-3.5 text-lg" disabled={busy || chosen.length < 1}
        onClick={async () => { if (await run(() => store.startFrame(table.id, chosen, []))) onClose() }}>
        <Icon name="play" /> Start timer · {formatRate(table)}
      </Button>
      {table.min_minutes > 1 && (
        <p className="mt-2 text-center text-xs text-stone-500">
          Minimum {formatMinutes(table.min_minutes)}{table.block_minutes > 1 && `, then charged in ${table.block_minutes}-minute blocks`}.
        </p>
      )}
    </Modal>
  )
}

function EndFrameDialog({ frameId, onClose }: { frameId: string; onClose: () => void }) {
  const { state } = useCounter()
  const frame = state.activeFrames.find((f) => f.id === frameId)
  const table = frame && state.tables.find((t) => t.id === frame.table_id)
  if (!frame || !table) return null // already ended on another device
  return <EndFrameBody frame={frame} table={table} onClose={onClose} />
}

/** "47 min played → 1 hr × ₹100/hr = ₹100" */
function CostLine({ seconds, frame, table }: { seconds: number; frame: ActiveFrame; table: Table }) {
  const billed = billedMinutes(seconds, frame)
  const played = playedMinutes(seconds)
  return (
    <>
      {billed !== played && <>{formatMinutes(played)} played → </>}
      {formatMinutes(billed)} at {frameRate(frame, table)} = <b className="text-brass-300">{formatRupees(frameAmount(seconds, frame))}</b>
    </>
  )
}

function EndFrameBody({ frame, table, onClose }: { frame: ActiveFrame; table: Table; onClose: () => void }) {
  const { store, run, busy, can } = useCounter()
  const { seconds, amount } = useFrameLive(frame)
  const names = usePlayerNames()
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [payers, setPayers] = useState(() => frame.players.map((p) => p.visit_id))
  const noun = nounFor(table)

  const end = async (side: Side | null, who?: string[]) => { if (await run(() => store.endFrame(frame.id, side, who))) onClose() }
  const togglePayer = (id: string) => setPayers((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id])
  const shares = payers.length ? splitAmount(amount, payers.length) : []

  return (
    <Modal title={`End ${noun} · ${table.name}`} onClose={onClose}>
      <div className="felt mb-4 rounded-2xl p-4 text-center text-white">
        <p className="tabular text-4xl font-extrabold">{formatDuration(seconds)}</p>
        <p className="mt-1 text-sm text-white/70"><CostLine seconds={seconds} frame={frame} table={table} /></p>
      </div>

      {frame.billing === 'loser' ? (
        <>
          <p className="mb-2 font-bold">Who lost? They pay for this {noun}.</p>
          <div className="mb-4 grid gap-2">
            {(['A', 'B'] as const).map((side) => {
              const sideNames = names.side(frame, side)
              const sideShares = splitAmount(amount, sideNames.length)
              return (
                <button key={side} disabled={busy} onClick={() => end(side)}
                  className={`rounded-2xl p-4 text-left ring-2 transition hover:brightness-[0.97] active:scale-[0.99] disabled:opacity-50 ${sideStyle[side].soft}`}>
                  <span className="block text-[11px] font-bold uppercase tracking-wider text-stone-500">Side {side} lost</span>
                  <span className="mt-1 block text-lg font-extrabold">{sideNames.join(' & ')}</span>
                  <span className="mt-1 flex flex-wrap gap-x-3 text-sm text-stone-600">
                    {sideNames.map((n, i) => <span key={n + i}>{n} pays <b className="text-stone-900">{formatRupees(sideShares[i])}</b></span>)}
                  </span>
                </button>
              )
            })}
          </div>
        </>
      ) : (
        <>
          <p className="mb-2 font-bold">Who pays? Untick anyone who isn’t paying.</p>
          <ul className="mb-4 divide-y divide-stone-100 overflow-hidden rounded-2xl bg-white ring-1 ring-stone-900/5">
            {frame.players.map((p) => {
              const on = payers.includes(p.visit_id)
              const name = names.nameOf(p.visit_id)
              return (
                <li key={p.visit_id}>
                  <button onClick={() => togglePayer(p.visit_id)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left">
                    <span className={`grid h-6 w-6 place-items-center rounded-md ring-1 ring-inset ${on ? 'bg-felt-700 text-white ring-felt-700' : 'ring-stone-300'}`}>
                      {on && <Icon name="check" className="h-4 w-4" />}
                    </span>
                    <span className="flex-1 font-semibold">{name}</span>
                    <b className="tabular">{on ? formatRupees(shares[payers.indexOf(p.visit_id)]) : '—'}</b>
                  </button>
                </li>
              )
            })}
          </ul>
          <Button className="mb-4 w-full py-3" disabled={busy || payers.length === 0} onClick={() => end(null, payers)}>
            <Icon name="flag" /> End session · {payers.length === 1 ? `${names.nameOf(payers[0])} pays` : `split ${payers.length} ways`}
          </Button>
        </>
      )}

      {!can('adjust') ? null : confirmCancel ? (
        <div className="rounded-2xl bg-red-50 p-3 ring-1 ring-red-200">
          <p className="mb-2 text-sm">Cancel this {noun}? <b>Nobody will be charged</b> for it.</p>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => setConfirmCancel(false)}>Keep {noun}</Button>
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
  const table = frame && state.tables.find((t) => t.id === frame.table_id)
  if (!frame || !table) return null // ended meanwhile
  return <AdjustTimeBody frame={frame} table={table} onClose={onClose} />
}

function AdjustTimeBody({ frame, table, onClose }: { frame: ActiveFrame; table: Table; onClose: () => void }) {
  const { store, run, busy } = useCounter()
  const { seconds } = useFrameLive(frame)
  const [minutes, setMinutes] = useState(() => String(Math.floor(seconds / 60)))
  const value = Number(minutes)
  const valid = minutes.trim() !== '' && Number.isInteger(value) && value >= 0 && value <= 24 * 60
  const nudge = (delta: number) => setMinutes(String(Math.max(0, (valid ? value : 0) + delta)))

  return (
    <Modal title={`Adjust time · ${table.name}`} onClose={onClose}>
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
        <p className="felt mb-4 rounded-xl p-3 text-center text-sm text-white/80">
          {capitalize(nounFor(table))} so far: <CostLine seconds={value * 60} frame={frame} table={table} />
        </p>
      )}
      <Button className="w-full" disabled={busy || !valid}
        onClick={async () => { if (await run(() => store.adjustFrameTime(frame.id, value * 60))) onClose() }}>
        <Icon name="check" /> Save time
      </Button>
    </Modal>
  )
}
