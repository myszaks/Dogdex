"use client"
import { useAuthContext } from '@/context/AuthProvider'

export default function useUser() {
  const ctx = useAuthContext()
  const isOrganizer = ctx.role === 'organizer' || ctx.role === 'organizer_trainer' || ctx.role === 'admin'
  const isTrainer = ctx.role === 'trainer' || ctx.role === 'organizer_trainer' || ctx.role === 'organizer' || ctx.role === 'admin'
  const isAdmin = ctx.role === 'admin'
  return { ...ctx, isOrganizer, isTrainer, isAdmin }
}
