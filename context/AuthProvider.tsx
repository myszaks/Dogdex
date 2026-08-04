"use client"
import React, { createContext, useContext, useEffect, useRef, useState } from 'react'
import { getSupabaseBrowserClient, requireSupabaseBrowserClient } from '@/lib/supabaseClient'
import type { User, Session, RealtimeChannel } from '@supabase/supabase-js'
import { fetchWithAuthRetry } from '@/lib/authFetch'

type AuthContextValue = {
  user: User | null
  session: Session | null
  role: string | null
  hasEventManagement: boolean
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const supabase = getSupabaseBrowserClient()
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [role, setRole] = useState<string | null>(null)
  const [hasEventManagement, setHasEventManagement] = useState(false)
  const [loading, setLoading] = useState(true)
  const realtimeChannelRef = useRef<RealtimeChannel | null>(null)

  async function fetchRole(userId: string) {
    const client = requireSupabaseBrowserClient()
    const { data } = await client
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single()
    setRole((data as { role: string } | null)?.role ?? 'user')
    try {
      const response = await fetchWithAuthRetry('/api/event-team-access')
      const access = response.ok ? await response.json() as { hasEventManagement?: boolean } : null
      setHasEventManagement(Boolean(access?.hasEventManagement))
    } catch {
      setHasEventManagement(false)
    }
  }

  function subscribeToProfileChanges(userId: string) {
    const client = getSupabaseBrowserClient()
    if (!client) return

    // Clean up any existing channel first
    if (realtimeChannelRef.current) {
      client.removeChannel(realtimeChannelRef.current)
      realtimeChannelRef.current = null
    }

    const channel = client
      .channel(`profile-role-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${userId}`,
        },
        (payload) => {
          const newRole = (payload.new as { role?: string })?.role
          if (newRole) setRole(newRole)
        }
      )
      .subscribe()

    realtimeChannelRef.current = channel
  }

  function unsubscribeFromProfileChanges() {
    const client = getSupabaseBrowserClient()
    if (realtimeChannelRef.current) {
      client?.removeChannel(realtimeChannelRef.current)
      realtimeChannelRef.current = null
    }
  }

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }

    const client = supabase
    let mounted = true

    async function init() {
      const { data } = await client.auth.getSession()
      const sess = data.session
      if (!mounted) return
      setSession(sess)
      setUser(sess?.user ?? null)
      if (sess?.user) {
        await fetchRole(sess.user.id)
        subscribeToProfileChanges(sess.user.id)
      }
      setLoading(false)
    }

    init()

    const { data: sub } = client.auth.onAuthStateChange((event, s) => {
      // Redirect to password reset page whenever a recovery session is established
      if (event === 'PASSWORD_RECOVERY') {
        window.location.href = '/reset-password'
        return
      }
      setSession(s)
      setUser(s?.user ?? null)
      if (s?.user) {
        fetchRole(s.user.id)
        subscribeToProfileChanges(s.user.id)
      } else {
        setRole(null)
        setHasEventManagement(false)
        unsubscribeFromProfileChanges()
      }
    })

    // Refresh role when user returns to the tab (fallback for when Realtime is not enabled)
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        client.auth.getUser().then(({ data }) => {
          if (data.user) fetchRole(data.user.id)
        })
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      mounted = false
      sub.subscription.unsubscribe()
      unsubscribeFromProfileChanges()
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [supabase])

  async function login(email: string, password: string) {
    const client = requireSupabaseBrowserClient()
    const { error } = await client.auth.signInWithPassword({ email, password })
    if (error) throw error
    const response = await fetchWithAuthRetry('/api/profile')
    if (response.status === 401) {
      throw new Error('Sesja nie została jeszcze zsynchronizowana.')
    }
  }

  async function logout() {
    const client = requireSupabaseBrowserClient()
    await client.auth.signOut()
    setUser(null)
    setSession(null)
    setRole(null)
    setHasEventManagement(false)
    window.location.href = '/'
  }

  return (
    <AuthContext.Provider value={{ user, session, role, hasEventManagement, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuthContext() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuthContext must be used within AuthProvider')
  return ctx
}
