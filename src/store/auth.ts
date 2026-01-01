import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import type { Session, User } from '@supabase/supabase-js'

type AuthState = {
  user: User | null
  session: Session | null
  initialized: boolean
  login: (email: string, password: string) => Promise<{ ok: true } | { ok: false; error: string }>
  logout: () => Promise<void>
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  session: null,
  initialized: false,

  async login(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return { ok: false, error: error.message }
    set({ user: data.user ?? null, session: data.session ?? null })
    return { ok: true }
  },

  async logout() {
    await supabase.auth.signOut()
    set({ user: null, session: null })
  },
}))

;(async () => {
  const { data } = await supabase.auth.getSession()
  useAuth.setState({
    user: data.session?.user ?? null,
    session: data.session ?? null,
    initialized: true,
  })
})()

supabase.auth.onAuthStateChange((_e, session) => {
  useAuth.setState({
    user: session?.user ?? null,
    session: session ?? null,
    initialized: true,
  })
})
