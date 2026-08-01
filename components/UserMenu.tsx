"use client"
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import useUser from '@/hooks/useUser'
import {
  ClipboardCheck,
  User,
  Settings,
  Shield,
  LogOut,
  ChevronDown,
  CalendarCog,
  Dumbbell,
} from 'lucide-react'
import { ROLE_LABELS, isAppRole } from '@/lib/roles'
import { cn } from '@/lib/utils'

interface Props {
  sidebar?: boolean
}

export default function UserMenu({ sidebar = false }: Props) {
  const { user, role, isAdmin, isOrganizer, isTrainer, logout } = useUser()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  if (!user) return null

  const name = user.user_metadata?.full_name || user.email || ''
  const parts = name.trim().split(/\s+/)
  const initials = parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0])
    : name.slice(0, 2)
  const roleLabel = isAppRole(role) ? ROLE_LABELS[role] : 'Nieznana rola'

  if (sidebar) {
    return (
      <div className="relative" ref={ref}>
        <button
          onClick={() => setOpen(v => !v)}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/10 transition-colors group"
          aria-label="Menu użytkownika"
        >
          <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center font-bold text-sm text-white shrink-0">
            {initials.toUpperCase()}
          </div>
          <div className="flex-1 text-left min-w-0">
            <p className="text-sm font-medium text-white truncate leading-tight">
              {user.user_metadata?.full_name || user.email?.split('@')[0]}
            </p>
            <p className="text-xs text-white/50 leading-none mt-0.5">{roleLabel}</p>
          </div>
          <ChevronDown className={cn('w-4 h-4 text-white/40 transition-transform', open && 'rotate-180')} />
        </button>

        {open && (
          <div className="absolute bottom-full left-0 right-0 mb-1 bg-white rounded-2xl shadow-xl p-1.5 z-[200]">
            <p className="text-xs text-muted-foreground px-3 py-1.5 border-b border-border mb-1 truncate">
              {user.email}
            </p>
            <DropdownItem href="/profile" icon={<User className="w-4 h-4" />} label="Profil" onClose={() => setOpen(false)} />
            <DropdownItem href="/settings" icon={<Settings className="w-4 h-4" />} label="Ustawienia" onClose={() => setOpen(false)} />
            {isAdmin && (
              <>
                <DropdownItem href="/admin/users" icon={<Shield className="w-4 h-4" />} label="Użytkownicy" onClose={() => setOpen(false)} accent />
                <DropdownItem href="/admin/role-requests" icon={<ClipboardCheck className="w-4 h-4" />} label="Wnioski o role" onClose={() => setOpen(false)} accent />
              </>
            )}
            <hr className="my-1 border-border" />
            <button
              onClick={() => { setOpen(false); logout() }}
              className="w-full text-left flex items-center gap-2.5 px-3 py-2 hover:bg-red-50 rounded-xl text-red-600 text-sm font-medium transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Wyloguj
            </button>
          </div>
        )}
      </div>
    )
  }

  // Mobile compact avatar
  return (
    <div className="relative" ref={ref}>
      <button
        className="w-8 h-8 rounded-full bg-accent text-white flex items-center justify-center font-bold text-sm shadow-sm"
        onClick={() => setOpen(v => !v)}
        aria-label="Menu użytkownika"
      >
        {initials.toUpperCase()}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-52 bg-white rounded-2xl shadow-xl p-1.5 z-[200]">
          <p className="text-xs text-muted-foreground px-3 py-1.5 border-b border-border mb-1 truncate">
            {user.email}
          </p>
          <DropdownItem href="/profile" icon={<User className="w-4 h-4" />} label="Profil" onClose={() => setOpen(false)} />
          <DropdownItem href="/settings" icon={<Settings className="w-4 h-4" />} label="Ustawienia" onClose={() => setOpen(false)} />
          {isTrainer && (
            <DropdownItem href="/trainer" icon={<Dumbbell className="w-4 h-4" />} label="Panel trenera" onClose={() => setOpen(false)} accent />
          )}
          {isOrganizer && (
            <DropdownItem href="/organizer" icon={<CalendarCog className="w-4 h-4" />} label="Panel organizatora" onClose={() => setOpen(false)} accent />
          )}
          {isAdmin && (
            <>
              <DropdownItem href="/admin/users" icon={<Shield className="w-4 h-4" />} label="Użytkownicy" onClose={() => setOpen(false)} accent />
              <DropdownItem href="/admin/role-requests" icon={<ClipboardCheck className="w-4 h-4" />} label="Wnioski o role" onClose={() => setOpen(false)} accent />
            </>
          )}
          <hr className="my-1 border-border" />
          <button
            onClick={() => { setOpen(false); logout() }}
            className="w-full text-left flex items-center gap-2.5 px-3 py-2 hover:bg-red-50 rounded-xl text-red-600 text-sm font-medium transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Wyloguj
          </button>
        </div>
      )}
    </div>
  )
}

function DropdownItem({
  href, icon, label, onClose, accent = false,
}: {
  href: string
  icon: React.ReactNode
  label: string
  onClose: () => void
  accent?: boolean
}) {
  return (
    <Link
      href={href}
      prefetch={false}
      onClick={onClose}
      className={cn(
        'flex items-center gap-2.5 px-3 py-2 hover:bg-secondary rounded-xl text-sm font-medium transition-colors',
        accent ? 'text-accent' : 'text-foreground'
      )}
    >
      {icon}
      {label}
    </Link>
  )
}

