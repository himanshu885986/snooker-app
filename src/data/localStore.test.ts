import { beforeEach, describe, expect, it } from 'vitest'
import { visitTotals } from '../lib/billing'
import { createLocalStore, type LocalStore } from './localStore'
import type { BranchState } from './types'

function memoryStorage() {
  const data = new Map<string, string>()
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  }
}

let clock: number
let store: LocalStore
let state: BranchState
let orgId: string

const minutes = (n: number) => { clock += n * 60_000 }
const reload = async () => { state = await store.load(orgId, null) }
const bill = (visitId: string) => visitTotals(state.openVisits.find((v) => v.id === visitId)!).due
const frameOn = (tableIndex: number) => state.activeFrames.find((f) => f.table_id === state.tables[tableIndex].id)!

beforeEach(async () => {
  clock = Date.UTC(2026, 0, 1, 16, 0)
  store = createLocalStore(memoryStorage(), () => clock)
  const owner = await store.auth.register('Sharma Snooker', 'Ramesh', '9876543210', '1234')
  orgId = owner.memberships[0].org_id
  await reload()
})

async function players(...names: string[]) {
  const ids: string[] = []
  for (const name of names) ids.push(await store.openVisit(state.branch.id, { player_name: name, phone: null }))
  await reload()
  return ids
}

describe('per-player billing', () => {
  it('charges only the losing side, split between its players, plus what each player bought', async () => {
    const [amit, ravi, sonu, raj] = await players('Amit', 'Ravi', 'Sonu', 'Raj')
    const table1 = state.tables[0]
    const table3 = state.tables[2]
    await store.saveTable({ ...table3, rate_paise_per_min: 900 })

    // Frame 1 on Table 1 (₹7/min), 2v2, 20 minutes, Amit + Ravi lose → ₹140 split 2 ways.
    await store.startFrame(table1.id, [amit, ravi], [sonu, raj])
    minutes(20)
    await reload()
    await store.endFrame(frameOn(0).id, 'A')

    // Frame 2 on Table 1, 25 minutes, Sonu + Raj lose → ₹175 split 2 ways.
    await store.startFrame(table1.id, [amit, ravi], [sonu, raj])
    minutes(25)
    await reload()
    await store.endFrame(frameOn(0).id, 'B')

    // Frame 3 on Table 3 (₹9/min), 1v1, 15 minutes, Amit loses → ₹135.
    await store.startFrame(table3.id, [amit], [sonu])
    minutes(15)
    await reload()
    await store.endFrame(frameOn(2).id, 'A')

    await reload()
    const maggi = state.products.find((p) => p.name === 'Maggi')!
    const coldDrink = state.products.find((p) => p.name === 'Cold drink')!
    await store.addItem(amit, maggi.id, 1)
    await store.addItem(amit, coldDrink.id, 2)
    await reload()

    expect(bill(amit)).toBe(7000 + 13500 + 4000 + 6000) // ₹305
    expect(bill(ravi)).toBe(7000)
    expect(bill(sonu)).toBe(8750)
    expect(bill(raj)).toBe(8750)
  })

  it('does not charge paused time', async () => {
    const [a, b] = await players('A', 'B')
    await store.startFrame(state.tables[0].id, [a], [b])
    await reload()
    const frameId = frameOn(0).id
    minutes(10)
    await store.pauseFrame(frameId)
    minutes(30) // power cut
    await store.resumeFrame(frameId)
    minutes(5)
    await store.endFrame(frameId, 'B')
    await reload()
    expect(bill(b)).toBe(15 * 700)
  })

  it('ends a paused frame without charging the open pause', async () => {
    const [a, b] = await players('A', 'B')
    await store.startFrame(state.tables[0].id, [a], [b])
    await reload()
    minutes(10)
    await store.pauseFrame(frameOn(0).id)
    minutes(20)
    await store.endFrame(frameOn(0).id, 'A')
    await reload()
    expect(bill(a)).toBe(10 * 700)
  })

  it('uses the rate at the time the frame started, even if the table rate changes mid-frame', async () => {
    const [a, b] = await players('A', 'B')
    await store.startFrame(state.tables[0].id, [a], [b])
    await store.saveTable({ ...state.tables[0], rate_paise_per_min: 1000 })
    minutes(10)
    await reload()
    await store.endFrame(frameOn(0).id, 'A')
    await reload()
    expect(bill(a)).toBe(7000)
  })

  it('charges nobody for a cancelled frame', async () => {
    const [a, b] = await players('A', 'B')
    await store.startFrame(state.tables[0].id, [a], [b])
    await reload()
    minutes(10)
    await store.cancelFrame(frameOn(0).id)
    await reload()
    expect(bill(a)).toBe(0)
    expect(bill(b)).toBe(0)
    expect(state.activeFrames).toHaveLength(0)
  })
})

describe('rules', () => {
  it('blocks a second frame on a busy table and a player on two tables', async () => {
    const [a, b, c, d] = await players('A', 'B', 'C', 'D')
    await store.startFrame(state.tables[0].id, [a], [b])
    await expect(store.startFrame(state.tables[0].id, [c], [d])).rejects.toThrow(/already has a frame/)
    await expect(store.startFrame(state.tables[1].id, [a], [c])).rejects.toThrow(/already playing/)
  })

  it('validates sides', async () => {
    const [a, b, c, d, e] = await players('A', 'B', 'C', 'D', 'E')
    await expect(store.startFrame(state.tables[0].id, [], [a])).rejects.toThrow(/1 or 2 players/)
    await expect(store.startFrame(state.tables[0].id, [a, b, c], [d])).rejects.toThrow(/1 or 2 players/)
    await expect(store.startFrame(state.tables[0].id, [a], [a])).rejects.toThrow(/both sides/)
    await store.startFrame(state.tables[0].id, [a, b], [e]) // 2 vs 1 is allowed
  })

  it('blocks checkout while the player is in a running frame', async () => {
    const [a, b] = await players('A', 'B')
    await store.startFrame(state.tables[0].id, [a], [b])
    await expect(store.checkout(a, 'cash')).rejects.toThrow(/running frame/)
  })

  it('checkout records the payment and closes the bill', async () => {
    const [a, b] = await players('A', 'B')
    await store.startFrame(state.tables[0].id, [a], [b])
    minutes(20)
    await reload()
    await store.endFrame(frameOn(0).id, 'A')
    await store.checkout(a, 'upi')
    await reload()
    expect(state.openVisits.map((v) => v.id)).toEqual([b])
    await expect(store.addItem(a, state.products[0].id, 1)).rejects.toThrow(/checked out/)
  })

  it('only lets shop items be removed, not frame charges', async () => {
    const [a, b] = await players('A', 'B')
    await store.addItem(a, state.products[0].id, 1)
    await store.startFrame(state.tables[0].id, [a], [b])
    minutes(5)
    await reload()
    await store.endFrame(frameOn(0).id, 'A')
    await reload()
    const visit = state.openVisits.find((v) => v.id === a)!
    const frameCharge = visit.charges.find((c) => c.source === 'frame')!
    const itemCharge = visit.charges.find((c) => c.source === 'item')!
    await expect(store.removeItem(frameCharge.id)).rejects.toThrow()
    await store.removeItem(itemCharge.id)
    await reload()
    expect(bill(a)).toBe(5 * 700)
  })
})

describe('admin time adjustment', () => {
  it('sets the played time of a running frame, keeping paused time out of the bill', async () => {
    const [a, b] = await players('A', 'B')
    await store.startFrame(state.tables[0].id, [a], [b])
    await reload()
    minutes(3)
    await store.pauseFrame(frameOn(0).id)
    minutes(10)
    // The timer was started late: the frame has really been played for 25 minutes.
    await store.adjustFrameTime(frameOn(0).id, 25 * 60)
    minutes(5) // still paused, so this doesn't count
    await store.resumeFrame(frameOn(0).id)
    minutes(2)
    await reload()
    expect(frameOn(0).time_adjusted).toBe(true)
    await store.endFrame(frameOn(0).id, 'A')
    await reload()
    expect(bill(a)).toBe(27 * 700)
  })
})

/** Admin adds a staff member with this role, then that person logs in. */
async function loginAsNew(role: 'maintainer' | 'viewer') {
  await store.addMember(orgId, { name: role, phone: '9111111111', role, pin: '4321' })
  await store.auth.logout()
  await store.auth.login('9111111111', '4321')
  await reload()
}

describe('login', () => {
  it('registers the owner as admin and logs people in with mobile + PIN', async () => {
    expect((await store.auth.whoami())?.memberships[0].role).toBe('admin')
    await store.auth.logout()
    expect(await store.auth.whoami()).toBeNull()
    await expect(store.load(orgId, null)).rejects.toThrow('log in')
    await expect(store.auth.login('9876543210', '0000')).rejects.toThrow('Wrong mobile number or PIN')
    const me = await store.auth.login('+91 98765 43210', '1234')
    expect(me.name).toBe('Ramesh')
  })

  it('allows only one demo business per browser', async () => {
    await expect(store.auth.register('Other', 'X', '9000000000', '1111')).rejects.toThrow('already has a demo business')
  })

  it('staff log in with the PIN the admin set, and a reset PIN replaces it', async () => {
    await store.addMember(orgId, { name: 'Mohan', phone: '9000000001', role: 'maintainer', pin: '5555' })
    await reload()
    const mohan = state.members.find((m) => m.name === 'Mohan')!
    expect(mohan).not.toHaveProperty('pin')
    await store.resetMemberPin(orgId, mohan.user_id, '7777')
    await store.auth.logout()
    await expect(store.auth.login('9000000001', '5555')).rejects.toThrow()
    expect((await store.auth.login('9000000001', '7777')).memberships[0].role).toBe('maintainer')
    await store.auth.changePin('7777', '8888')
    await store.auth.logout()
    await store.auth.login('9000000001', '8888')
  })
})

describe('roles', () => {
  it('maintainer runs tables and adds items but cannot take money or change times', async () => {
    const [a, b] = await players('A', 'B')
    await loginAsNew('maintainer')
    await store.startFrame(state.tables[0].id, [a], [b])
    await reload()
    const frameId = frameOn(0).id
    await store.pauseFrame(frameId)
    await store.resumeFrame(frameId)
    await expect(store.adjustFrameTime(frameId, 60)).rejects.toThrow('Only the admin')
    await expect(store.cancelFrame(frameId)).rejects.toThrow('Only the admin')
    minutes(10)
    await store.endFrame(frameId, 'A')
    await store.addItem(a, state.products[0].id, 1)
    await reload()
    const item = state.openVisits.find((v) => v.id === a)!.charges.find((c) => c.source === 'item')!
    await expect(store.removeItem(item.id)).rejects.toThrow('Only the admin')
    await expect(store.checkout(a, 'cash')).rejects.toThrow('Only the admin')
    await expect(store.saveTable({ ...state.tables[0], rate_paise_per_min: 100 })).rejects.toThrow('Only the admin')
    expect(state.members).toEqual([])
  })

  it('viewer cannot change anything', async () => {
    const [a, b] = await players('A', 'B')
    await loginAsNew('viewer')
    await expect(store.openVisit(state.branch.id, { player_name: 'X', phone: null })).rejects.toThrow('viewer')
    await expect(store.startFrame(state.tables[0].id, [a], [b])).rejects.toThrow('viewer')
    await expect(store.addItem(a, state.products[0].id, 1)).rejects.toThrow('viewer')
  })

  it('admin manages staff; the admin cannot be removed', async () => {
    await store.addMember(orgId, { name: 'Mohan', phone: '+91 90000 00001', role: 'maintainer', pin: '5555' })
    await expect(store.addMember(orgId, { name: 'Dup', phone: '9000000001', role: 'viewer', pin: '5555' })).rejects.toThrow('already')
    await expect(store.addMember(orgId, { name: 'Z', phone: '12345', role: 'viewer', pin: '5555' })).rejects.toThrow('mobile')
    await expect(store.addMember(orgId, { name: 'Z', phone: '9000000002', role: 'viewer', pin: '12' })).rejects.toThrow('PIN')
    await reload()
    const mohan = state.members.find((m) => m.name === 'Mohan')!
    expect(mohan.phone).toBe('9000000001')
    await store.updateMemberRole(orgId, mohan.user_id, 'viewer')
    await reload()
    expect(state.members.find((m) => m.name === 'Mohan')!.role).toBe('viewer')
    const admin = state.members.find((m) => m.role === 'admin')!
    await expect(store.removeMember(orgId, admin.user_id)).rejects.toThrow('not found')
    await store.removeMember(orgId, mohan.user_id)
    await reload()
    expect(state.members).toHaveLength(1)
  })
})

describe('payments and khata', () => {
  const item = (name: string) => state.products.find((p) => p.name === name)!.id
  const visitOf = (id: string) => state.openVisits.find((v) => v.id === id)

  it('takes part-payments and keeps the bill open until the rest is paid', async () => {
    const [a] = await players('A')
    await store.addItem(a, item('Maggi'), 3) // ₹120
    await store.recordPayment(a, 5000, 'cash')
    await reload()
    expect(bill(a)).toBe(7000)
    await expect(store.recordPayment(a, 9000, 'upi')).rejects.toThrow('more than the ₹70 due')
    await expect(store.recordPayment(a, 0, 'upi')).rejects.toThrow('more than ₹0')
    await store.checkout(a, 'upi')
    await reload()
    expect(visitOf(a)).toBeUndefined()
  })

  it('links players who give a mobile number to a customer', async () => {
    const withPhone = await store.openVisit(state.branch.id, { player_name: 'Amit', phone: '+91 98111 11111' })
    const without = await store.openVisit(state.branch.id, { player_name: 'Ravi', phone: null })
    await reload()
    expect(visitOf(withPhone)!.customer_id).not.toBeNull()
    expect(visitOf(without)!.customer_id).toBeNull()
    // The same number later is the same customer.
    const again = await store.openVisit(state.branch.id, { player_name: 'Amit K', phone: '9811111111' })
    await reload()
    expect(visitOf(again)!.customer_id).toBe(visitOf(withPhone)!.customer_id)
  })

  it('puts the unpaid rest on khata, and reopening the bill brings it back', async () => {
    const [a] = await players('A')
    await store.addItem(a, item('Maggi'), 3) // ₹120
    await store.recordPayment(a, 5000, 'cash')
    await expect(store.closeToKhata(a, 'Amit', '123')).rejects.toThrow('mobile')
    await store.closeToKhata(a, 'Amit', '9811111111')
    await reload()
    expect(visitOf(a)).toBeUndefined()
    expect(state.khata).toEqual([expect.objectContaining({ name: 'Amit', phone: '9811111111', balance_paise: 7000 })])

    await store.reopenVisit(a)
    await reload()
    expect(bill(a)).toBe(7000)
    expect(state.khata).toEqual([])

    // A payment recorded by mistake can be removed while the bill is open.
    const payment = visitOf(a)!.payments[0]
    await store.voidPayment(payment.id)
    await expect(store.voidPayment(payment.id)).rejects.toThrow('already removed')
    await reload()
    expect(bill(a)).toBe(12000)
    await store.checkout(a, 'cash')
    await expect(store.voidPayment(payment.id)).rejects.toThrow()
  })

  it('receives khata money, never more than is owed, and records old balances', async () => {
    const [a] = await players('A')
    await store.addItem(a, item('Tea'), 4) // ₹60
    await store.closeToKhata(a, 'Ravi', '9822222222')
    await reload()
    const ravi = state.khata[0]
    minutes(5)
    await store.receiveKhata(ravi.id, state.branch.id, 2000, 'upi')
    await expect(store.receiveKhata(ravi.id, state.branch.id, 5000, 'cash')).rejects.toThrow('more than the ₹40 on khata')
    let ledger = await store.loadKhata(ravi.id)
    expect(ledger.customer.balance_paise).toBe(4000)
    expect(ledger.entries.map((e) => e.kind)).toEqual(['payment', 'charge'])
    await expect(store.voidKhataEntry(ledger.entries[1].id)).rejects.toThrow('Reopen the bill')
    await store.voidKhataEntry(ledger.entries[0].id)
    ledger = await store.loadKhata(ravi.id)
    expect(ledger.customer.balance_paise).toBe(6000)

    await store.addKhata(orgId, state.branch.id, 'Old Customer', '9833333333', 25000, 'From paper khata')
    await reload()
    expect(state.khata.map((c) => [c.name, c.balance_paise]).sort()).toEqual([['Old Customer', 25000], ['Ravi', 6000]])
  })

  it('history lists bills closed in the period with day totals', async () => {
    const { summarize } = await import('../lib/finance')
    const [a, b, c] = await players('A', 'B', 'C')
    await store.addItem(a, item('Maggi'), 1) // ₹40 cash
    await store.addItem(b, item('Tea'), 2) // ₹30: ₹10 UPI + ₹20 khata
    await store.addItem(c, item('Chips'), 1) // stays open
    await store.checkout(a, 'cash')
    await store.recordPayment(b, 1000, 'upi')
    await store.closeToKhata(b, 'B', '9844444444')
    await reload()
    await store.receiveKhata(state.khata[0].id, state.branch.id, 500, 'cash')

    const from = new Date(clock - 3600_000).toISOString()
    const to = new Date(clock + 3600_000).toISOString()
    const history = await store.loadHistory(state.branch.id, from, to)
    expect(history.visits.map((v) => v.player_name).sort()).toEqual(['A', 'B'])
    expect(summarize(history)).toEqual({
      bills: 2, billed: 7000, cash: 4500, upi: 1000, onKhata: 2000, khataReceived: 500, collected: 5500,
    })
    const yesterday = await store.loadHistory(state.branch.id, new Date(clock - 2 * 86400_000).toISOString(), from)
    expect(yesterday.visits).toEqual([])
  })

  it('only the admin handles money, history and khata', async () => {
    const [a] = await players('A')
    await store.addItem(a, item('Maggi'), 1)
    await loginAsNew('maintainer')
    await expect(store.recordPayment(a, 100, 'cash')).rejects.toThrow('Only the admin')
    await expect(store.closeToKhata(a, 'A', '9811111111')).rejects.toThrow('Only the admin')
    await expect(store.loadHistory(state.branch.id, '2000-01-01', '2100-01-01')).rejects.toThrow('Only the admin')
    await expect(store.addKhata(orgId, state.branch.id, 'X', '9811111111', 100, '')).rejects.toThrow('Only the admin')
    expect(state.khata).toEqual([])
  })
})
