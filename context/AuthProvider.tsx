"use client"
import React, { createContext, useContext, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

type AuthContextValue = {
  user: any | null
  session: any | null
  role: string | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any | null>(null)
  const [session, setSession] = useState<any | null>(null)
  const [role, setRole] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const realtimeChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  async function fetchRole(userId: string) {
    const { data } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single()
    setRole((data as any)?.role ?? 'user')
  }

  function subscribeToProfileChanges(userId: string) {
    // Clean up any existing channel first
    if (realtimeChannelRef.current) {
      supabase.removeChannel(realtimeChannelRef.current)
      realtimeChannelRef.current = null
    }

    const channel = supabase
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
          const newRole = (payload.new as any)?.role
          if (newRole) setRole(newRole)
        }
      )
      .subscribe()

    realtimeChannelRef.current = channel
  }

  function unsubscribeFromProfileChanges() {
    if (realtimeChannelRef.current) {
      supabase.removeChannel(realtimeChannelRef.current)
      realtimeChannelRef.current = null
    }
  }

  useEffect(() => {
    let mounted = true

    async function init() {
      const { data } = await supabase.auth.getSession()
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

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      setUser(s?.user ?? null)
      if (s?.user) {
        fetchRole(s.user.id)
        subscribeToProfileChanges(s.user.id)
      } else {
        setRole(null)
        unsubscribeFromProfileChanges()
      }
    })

    // Refresh role when user returns to the tab (fallback for when Realtime is not enabled)
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        supabase.auth.getUser().then(({ data }) => {
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
  }, [])

  async function login(email: string, password: string) {
    await supabase.auth.signInWithPassword({ email, password })
  }

  async function logout() {
    await supabase.auth.signOut()
    setUser(null)
    setSession(null)
    setRole(null)
  }

  return (
    <AuthContext.Provider value={{ user, session, role, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuthContext() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuthContext must be used within AuthProvider')
  return ctx
}
