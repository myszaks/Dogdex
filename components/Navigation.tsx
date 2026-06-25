 'use client'
import Link from 'next/link'
import { usePathname, useSearchParams, useRouter } from 'next/navigation'
import { useState, useEffect, Suspense } from 'react'
import AuthModal from './AuthModal'
import ContactModal from './ContactModal'
import UserMenu from './UserMenu'
import useUser from '@/hooks/useUser'
import {
  Home,
  Archive,
  ClipboardList,
  Dog,
  Settings2,
  PawPrint,
  LogIn,
  Search,
  HelpCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'

function AuthParamHandler({ onOpen }: { onOpen: () => void }) {
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    if (!searchParams) return
    if (searchParams.get('auth_required')) {
      onOpen()
      router.replace(pathname ?? '/')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams.toString()])

  return null
}

export default function Navigation() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [contactOpen, setContactOpen] = useState(false)
  const { isOrganizer, user } = useUser()

  const navLinks = [
    { href: '/', label: 'Główna', Icon: Home },
    { href: '/archive', label: 'Archiwum', Icon: Archive },
  ]
  if (user) navLinks.push({ href: '/moje-zapisy', label: 'Moje zapisy', Icon: ClipboardList })
  if (user) navLinks.push({ href: '/moje-psy', label: 'Moje psy', Icon: Dog })
  if (user) navLinks.push({ href: '/trainings', label: 'Treningi indywidualne', Icon: PawPrint })
  if (isOrganizer) navLinks.push({ href: '/trainer', label: 'Panel trenera', Icon: Settings2 })
  if (isOrganizer) navLinks.push({ href: '/organizer', label: 'Organizator', Icon: Settings2 })

  function isActive(href: string) {
    if (href === '/') return pathname === '/'
    return pathname?.startsWith(href)
  }

  return (
    <>
      {/* ── Desktop Sidebar ────────────────────────────────── */}
      <aside className="hidden md:flex fixed top-0 left-0 h-full w-[260px] flex-col z-40 bg-[#1E3932] text-white shadow-xl">
        {/* Brand */}
        <div className="px-6 py-7 border-b border-white/10">
          <Link href="/" className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-accent flex items-center justify-center shrink-0">
              <PawPrint className="w-5 h-5 text-white" />
            </div>
            <span className="font-heading font-bold text-xl tracking-tight">Dogdex</span>
          </Link>
        </div>

        {/* Nav links */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {navLinks.map(({ href, label, Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150',
                isActive(href)
                  ? 'bg-[#EFF4F2] text-[#1E3932] font-semibold shadow-sm'
                  : 'text-white/80 hover:bg-white/10 hover:text-white'
              )}
            >
              <Icon className={cn('w-4.5 h-4.5 shrink-0', isActive(href) ? 'text-[#1E3932]' : 'text-white/60')} />
              {label}
            </Link>
          ))}
        </nav>

        {/* Bottom: user section */}
        <div className="px-4 py-4 border-t border-white/10 space-y-1">
          <button
            onClick={() => setContactOpen(true)}
            className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium text-white/80 hover:bg-white/10 hover:text-white transition-colors"
          >
            <HelpCircle className="w-4 h-4 shrink-0" />
            Pomoc
          </button>
          <AuthControlsSidebar openModal={() => setOpen(true)} />
        </div>
      </aside>

      {/* ── Mobile Top Bar ─────────────────────────────────── */}
      <header className="md:hidden fixed top-0 left-0 right-0 z-40 bg-[#1E3932] text-white px-4 py-3 flex items-center justify-between shadow-md">
        <Link href="/" className="flex items-center gap-2 font-heading font-bold text-lg">
          <PawPrint className="w-5 h-5 text-accent" />
          Dogdex
        </Link>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setContactOpen(true)}
            className="p-2 rounded-xl text-white/80 hover:bg-white/10 hover:text-white transition-colors"
            title="Pomoc"
            aria-label="Pomoc i kontakt"
          >
            <HelpCircle className="w-5 h-5" />
          </button>
          <AuthControlsMobile openModal={() => setOpen(true)} />
        </div>
      </header>

      {/* Mobile top bar spacer */}
      <div className="md:hidden h-[52px]" />

      {/* ── Mobile Bottom Nav ──────────────────────────────── */}
      <nav
        className="fixed bottom-0 left-0 right-0 bg-white border-t border-border z-40 md:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex">
          {navLinks.map(({ href, label, Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex-1 flex flex-col items-center py-2.5 gap-0.5 text-[10px] font-medium transition-colors min-h-[52px] justify-center',
                isActive(href) ? 'text-accent' : 'text-muted-foreground'
              )}
            >
              <Icon className={cn('w-5 h-5', isActive(href) ? 'text-accent' : 'text-muted-foreground/70')} />
              <span className="leading-none">{label}</span>
            </Link>
          ))}
          {/* Profile shortcut on mobile */}
          {user && (
            <Link
              href="/profile"
              className={cn(
                'flex-1 flex flex-col items-center py-2.5 gap-0.5 text-[10px] font-medium transition-colors min-h-[52px] justify-center',
                pathname?.startsWith('/profile') ? 'text-accent' : 'text-muted-foreground'
              )}
            >
              <Search className="w-5 h-5 text-muted-foreground/70" />
              <span>Profil</span>
            </Link>
          )}
        </div>
      </nav>

      <Suspense fallback={null}>
        <AuthParamHandler onOpen={() => setOpen(true)} />
      </Suspense>
      <AuthModal open={open} onClose={() => setOpen(false)} />
      <ContactModal open={contactOpen} onClose={() => setContactOpen(false)} />
    </>
  )
}

function AuthControlsSidebar({ openModal }: { openModal: () => void }) {
  const { user } = useUser()
  if (!user) {
    return (
      <button
        onClick={openModal}
        className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium text-white/80 hover:bg-white/10 hover:text-white transition-colors"
      >
        <LogIn className="w-4 h-4 shrink-0" />
        Zaloguj się
      </button>
    )
  }
  return <UserMenu sidebar />
}

function AuthControlsMobile({ openModal }: { openModal: () => void }) {
  const { user } = useUser()
  if (!user) {
    return (
      <button
        onClick={openModal}
        className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-accent text-white hover:bg-orange-600 transition-colors"
      >
        Zaloguj
      </button>
    )
  }
  return <UserMenu />
}

