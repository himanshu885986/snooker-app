// Mobile + PIN login without SMS costs: every device gets a free anonymous
// Supabase session, and the database links it to a person once the PIN is
// checked (pin_login in supabase/schema.sql).

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Account, AuthApi } from './types'

export function createSupabaseAuth(supabase: SupabaseClient): AuthApi {
  async function ensureDeviceSession() {
    const { data } = await supabase.auth.getSession()
    if (data.session) return
    const { error } = await supabase.auth.signInAnonymously()
    if (error) throw new Error(`Could not start a session: ${error.message}`)
  }

  async function call<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
    await ensureDeviceSession()
    const { data, error } = await supabase.rpc(fn, args)
    if (error) throw new Error(error.message)
    return data as T
  }

  return {
    whoami: () => call<Account | null>('whoami'),

    async login(phone, pin) {
      const result = await call<Account | { error: string }>('pin_login', { p_phone: phone, p_pin: pin })
      if ('error' in result) throw new Error(result.error)
      return result
    },

    register: (businessName, ownerName, phone, pin) =>
      call<Account>('register_business', { p_business_name: businessName, p_owner_name: ownerName, p_phone: phone, p_pin: pin }),

    // Keep the device's anonymous session; just unlink the person from it.
    logout: () => call<void>('pin_logout'),

    changePin: (oldPin, newPin) => call<void>('change_my_pin', { p_old_pin: oldPin, p_new_pin: newPin }),
  }
}
