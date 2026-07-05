"use client"
import { useAuthContext } from '@/context/AuthProvider'
import { isOrganizerRole, isTrainerRole } from '@/lib/roles'

export default function useUser() {
  const ctx = useAuthContext()
  const isOrganizer = isOrganizerRole(ctx.role)
  const isTrainer = isTrainerRole(ctx.role)
  const isAdmin = ctx.role === 'admin'
  return { ...ctx, isOrganizer, isTrainer, isAdmin }
}
