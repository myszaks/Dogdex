"use client"
import { useAuthContext } from '@/context/AuthProvider'

export default function useUser() {
  const ctx = useAuthContext()
  const isOrganizer = ctx.role === 'organizer' || ctx.role === 'admin'
  const isAdmin = ctx.role === 'admin'
  return { ...ctx, isOrganizer, isAdmin }
}
