// Real database. Anything involving money goes through the SQL functions in
// supabase/schema.sql so the rules are enforced on the server, not the device.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ActiveFrame, Branch, BranchState, Charge, DataStore, FramePause, FramePlayer, Member, OpenVisit, Org, Payment, Product, Role, Table } from './types'

function check<T>(result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message)
  return result.data
}

export function createSupabaseStore(supabase: SupabaseClient): DataStore {
  async function rpc(fn: string, args: Record<string, unknown>) {
    check(await supabase.rpc(fn, args))
  }

  return {
    mode: 'supabase',

    async load(orgId, branchId) {
      const [org, branchRows, role] = await Promise.all([
        supabase.from('organizations').select('id, name').eq('id', orgId).single(),
        supabase.from('branches').select('*').eq('org_id', orgId).order('created_at'),
        supabase.rpc('org_role', { p_org_id: orgId }),
      ])
      const branches = check(branchRows) as Branch[]
      if (branches.length === 0) throw new Error('This business has no shops yet.')
      const branch = branches.find((b) => b.id === branchId) ?? branches[0]
      const myRole = check(role) as Role | null
      if (!myRole) throw new Error('You are no longer a member of this business.')

      const [tables, products, frames, visits] = await Promise.all([
        supabase.from('tables').select('*').eq('branch_id', branch.id).eq('active', true).order('sort'),
        supabase.from('products').select('*').eq('branch_id', branch.id).eq('active', true).order('name'),
        supabase.from('frames').select('*, players:frame_players(*), pauses:frame_pauses(*)')
          .eq('branch_id', branch.id).in('status', ['running', 'paused']),
        supabase.from('visits').select('*, charges(*), payments(*)')
          .eq('branch_id', branch.id).eq('status', 'open').order('opened_at'),
      ])

      const members = myRole === 'admin'
        ? check(await supabase.rpc('list_members', { p_org_id: orgId })) as Member[]
        : []

      return {
        org: check(org) as Org,
        role: myRole,
        members,
        branches,
        branch,
        tables: check(tables) as Table[],
        products: check(products) as Product[],
        activeFrames: (check(frames) as (ActiveFrame & { players: FramePlayer[]; pauses: FramePause[] })[]),
        openVisits: (check(visits) as OpenVisit[]).map((v) => ({
          ...v,
          charges: [...(v.charges as Charge[])].sort((a, b) => a.created_at.localeCompare(b.created_at)),
          payments: v.payments as Payment[],
        })),
      } satisfies BranchState
    },

    subscribe(onChange) {
      // Any change on any device reloads the screen. Batched so a frame ending
      // (several rows changing at once) triggers one reload, not five.
      let timer: ReturnType<typeof setTimeout> | undefined
      const channel = supabase
        .channel('counter')
        .on('postgres_changes', { event: '*', schema: 'public' }, () => {
          clearTimeout(timer)
          timer = setTimeout(onChange, 200)
        })
        .subscribe()
      return () => {
        clearTimeout(timer)
        void supabase.removeChannel(channel)
      }
    },

    async openVisit(branchId, player) {
      const name = player.player_name.trim()
      if (!name) throw new Error('Player name is required')
      const row = check(await supabase.from('visits')
        .insert({ branch_id: branchId, player_name: name, phone: player.phone?.trim() || null })
        .select('id').single()) as { id: string }
      return row.id
    },

    startFrame: (tableId, sideA, sideB) => rpc('start_frame', { p_table_id: tableId, p_side_a: sideA, p_side_b: sideB }),
    pauseFrame: (frameId) => rpc('pause_frame', { p_frame_id: frameId }),
    resumeFrame: (frameId) => rpc('resume_frame', { p_frame_id: frameId }),
    adjustFrameTime: (frameId, playedSeconds) => rpc('adjust_frame_time', { p_frame_id: frameId, p_played_seconds: playedSeconds }),
    endFrame: (frameId, losingSide) => rpc('end_frame', { p_frame_id: frameId, p_losing_side: losingSide }),
    cancelFrame: (frameId) => rpc('cancel_frame', { p_frame_id: frameId }),
    addItem: (visitId, productId, quantity) => rpc('add_item', { p_visit_id: visitId, p_product_id: productId, p_quantity: quantity }),
    removeItem: (chargeId) => rpc('remove_item', { p_charge_id: chargeId }),
    checkout: (visitId, mode) => rpc('checkout', { p_visit_id: visitId, p_mode: mode }),

    async saveBranch(branch) {
      if (!branch.name.trim()) throw new Error('Shop name is required')
      check(await supabase.from('branches').upsert(branch))
    },

    async saveTable(table) {
      if (!table.name.trim()) throw new Error('Table name is required')
      if (table.rate_paise_per_min <= 0) throw new Error('Rate must be more than ₹0')
      check(await supabase.from('tables').upsert(table))
    },

    async saveProduct(product) {
      if (!product.name.trim()) throw new Error('Product name is required')
      if (product.price_paise < 0) throw new Error('Price cannot be negative')
      check(await supabase.from('products').upsert(product))
    },

    async addMember(orgId, m) {
      return check(await supabase.rpc('add_member', {
        p_org_id: orgId, p_name: m.name, p_phone: m.phone, p_role: m.role, p_pin: m.pin,
      })) as { existing: boolean }
    },
    updateMemberRole: (orgId, userId, role) => rpc('update_member_role', { p_org_id: orgId, p_user_id: userId, p_role: role }),
    removeMember: (orgId, userId) => rpc('remove_member', { p_org_id: orgId, p_user_id: userId }),
    resetMemberPin: (orgId, userId, pin) => rpc('reset_member_pin', { p_org_id: orgId, p_user_id: userId, p_pin: pin }),
  }
}
