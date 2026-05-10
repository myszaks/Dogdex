 'use client'
import Link from 'next/link'
import { usePathname, useSearchParams, useRouter } from 'next/navigation'
import { useState, useEffect, Suspense } from 'react'
import AuthModal from './AuthModal'
import UserMenu from './UserMenu'
import useUser from '@/hooks/useUser'

/** Isolated component so useSearchParams() stays inside a Suspense boundary */
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
  const { isOrganizer, user } = useUser()

  const navLinks = [
    { href: '/', label: 'Główna', icon: '🏠' },
    { href: '/archive', label: 'Archiwum', icon: '📁' },
  ]

  if (user) navLinks.push({ href: '/moje-zapisy', label: 'Moje zapisy', icon: '📋' })
  if (isOrganizer) navLinks.push({ href: '/organizer', label: 'Organizator', icon: '⚙️' })

  function isActive(href: string) {
    if (href === '/') return pathname === '/'
    return pathname?.startsWith(href)
  }

  return (
    <>
      {/* Desktop / top header */}
      <header className="bg-sky-700 text-white sticky top-0 z-50 shadow-md">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <Link href="/" className="font-bold text-xl flex items-center gap-2 shrink-0">
            🐾 Dogdex
          </Link>
          {/* Auth controls visible on all breakpoints */}
          <div className="flex items-center gap-2">
            <nav className="hidden md:flex items-center gap-2">
              {navLinks.map(l => (
                <Link
                  key={l.href}
                  href={l.href}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive(l.href) ? 'bg-white/20' : 'hover:bg-white/10'
                  }`}
                >
                  {l.icon} {l.label}
                </Link>
              ))}
            </nav>
            <AuthControls openModal={() => setOpen(true)} />
          </div>
        </div>
      </header>

      {/* Mobile bottom navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 z-50 md:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="flex">
          {navLinks.map(l => (
            <Link
              key={l.href}
              href={l.href}
              className={`flex-1 flex flex-col items-center py-3 text-xs gap-0.5 transition-colors min-h-[56px] justify-center ${
                isActive(l.href) ? 'text-sky-600 font-semibold' : 'text-slate-500'
              }`}
            >
              <span className="text-xl leading-none">{l.icon}</span>
              <span className="leading-none mt-0.5">{l.label}</span>
            </Link>
          ))}
        </div>
      </nav>

      <Suspense fallback={null}>
        <AuthParamHandler onOpen={() => setOpen(true)} />
      </Suspense>
      <AuthModal open={open} onClose={() => setOpen(false)} />
    </>
  )
}

function AuthControls({ openModal }: { openModal: () => void }) {
  const { user } = useUser()
  if (!user) {
    return (
      <button onClick={openModal} className="px-3 py-1 rounded-lg text-sm bg-white/10 hover:bg-white/20">
        Zaloguj
      </button>
    )
  }
  return <UserMenu />
}
