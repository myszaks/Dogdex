'use client'

import { useState } from 'react'
import Link from 'next/link'
import { requireSupabaseBrowserClient } from '@/lib/supabaseClient'

interface Props {
  email: string
  provider: string
}

function checkPassword(pw: string) {
  return {
    length: pw.length >= 9,
    upper: /[A-Z]/.test(pw),
    digit: /[0-9]/.test(pw),
    special: /[^A-Za-z0-9]/.test(pw),
  }
}

export default function SettingsClient({ email, provider }: Props) {
  const isEmailProvider = provider === 'email'

  // --- Change password ---
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [pwLoading, setPwLoading] = useState(false)
  const [pwError, setPwError] = useState<string | null>(null)
  const [pwSuccess, setPwSuccess] = useState(false)

  const pwChecks = checkPassword(newPw)
  const pwValid = Object.values(pwChecks).every(Boolean)

  async function handleChangePassword(e: React.FormEvent) {
    const supabase = requireSupabaseBrowserClient()
    e.preventDefault()
    setPwError(null)
    setPwSuccess(false)

    if (!pwValid) { setPwError('Hasło nie spełnia wymagań złożoności.'); return }
    if (newPw !== confirmPw) { setPwError('Hasła nie są zgodne.'); return }
    if (currentPw === newPw) { setPwError('Nowe hasło musi być inne niż obecne.'); return }

    setPwLoading(true)
    // Re-authenticate with current password first
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password: currentPw })
    if (signInError) {
      setPwLoading(false)
      setPwError('Obecne hasło jest nieprawidłowe.')
      return
    }

    const { error } = await supabase.auth.updateUser({ password: newPw })
    setPwLoading(false)
    if (error) {
      const msg = error.message.toLowerCase()
      if (msg.includes('same password') || msg.includes('different from the old') || msg.includes('should be different')) {
        setPwError('Nowe hasło musi być inne niż poprzednie.')
      } else {
        setPwError(error.message)
      }
    } else {
      setPwSuccess(true)
      setCurrentPw(''); setNewPw(''); setConfirmPw('')
      setTimeout(() => setPwSuccess(false), 4000)
    }
  }

  async function handleSignOutAll() {
    const supabase = requireSupabaseBrowserClient()
    await supabase.auth.signOut({ scope: 'global' })
    window.location.href = '/'
  }

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div className="flex items-center gap-4 mb-2">
        <Link href="/profile" className="text-muted-foreground hover:text-foreground text-sm transition-colors shrink-0">← Profil</Link>
        <span className="text-muted-foreground/30 select-none">|</span>
        <h1 className="page-title mb-0">Ustawienia konta</h1>
      </div>

      {/* Change password */}
      {isEmailProvider ? (
        <form onSubmit={handleChangePassword} className="bg-card rounded-3xl border border-border p-6 shadow-sm space-y-4">
          <h2 className="font-heading font-semibold text-foreground">Zmiana hasła</h2>

          <div>
            <label htmlFor="settings-current-password" className="block text-sm font-medium text-foreground mb-1.5">Obecne hasło</label>
            <input id="settings-current-password" type="password" value={currentPw} onChange={e => setCurrentPw(e.target.value)}
              aria-describedby={pwError ? 'settings-password-error' : undefined}
              className="form-input" autoComplete="current-password" required />
          </div>

          <div>
            <label htmlFor="settings-new-password" className="block text-sm font-medium text-foreground mb-1.5">Nowe hasło</label>
            <input id="settings-new-password" type="password" value={newPw} onChange={e => setNewPw(e.target.value)}
              aria-describedby={pwError ? 'settings-password-error' : undefined}
              className="form-input" autoComplete="new-password" placeholder="Min. 9 znaków" required />
            {newPw.length > 0 && (
              <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
                {([
                  [pwChecks.length, 'Min. 9 znaków'],
                  [pwChecks.upper, 'Duża litera'],
                  [pwChecks.digit, 'Cyfra'],
                  [pwChecks.special, 'Znak specjalny'],
                ] as [boolean, string][]).map(([ok, label]) => (
                  <span key={label} className={`text-xs flex items-center gap-1 ${ok ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                    <span className="font-bold">{ok ? '✓' : '○'}</span>{label}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div>
            <label htmlFor="settings-confirm-password" className="block text-sm font-medium text-foreground mb-1.5">Powtórz nowe hasło</label>
            <input id="settings-confirm-password" type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)}
              aria-describedby={`${confirmPw.length > 0 && newPw !== confirmPw ? 'settings-password-match ' : ''}${pwError ? 'settings-password-error' : ''}`.trim() || undefined}
              className="form-input" autoComplete="new-password" required />
            {confirmPw.length > 0 && newPw !== confirmPw && (
              <p id="settings-password-match" className="text-xs text-red-500 mt-1">Hasła nie są zgodne</p>
            )}
          </div>

          {pwError && <div id="settings-password-error" role="alert" className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{pwError}</div>}
          {pwSuccess && <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700">✓ Hasło zostało zmienione!</div>}

          <button type="submit" disabled={pwLoading} className="btn btn-primary w-full">
            {pwLoading ? 'Zmienianie…' : 'Zmień hasło'}
          </button>
        </form>
      ) : (
        <div className="bg-card rounded-3xl border border-border p-8 shadow-sm text-center space-y-2">
          <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center mx-auto mb-3">
            <span className="text-xl">🔑</span>
          </div>
          <p className="text-muted-foreground text-sm">
            Twoje konto jest połączone z <strong className="text-foreground">{provider}</strong>.<br/>
            Zmiana hasła odbywa się przez dostawcę logowania.
          </p>
        </div>
      )}

      {/* Sign out all devices */}
      <div className="bg-card rounded-3xl border border-border p-6 shadow-sm space-y-3">
        <h2 className="font-heading font-semibold text-foreground">Bezpieczeństwo</h2>
        <p className="text-sm text-muted-foreground">
          Wyloguj się ze wszystkich urządzeń i sesji jednocześnie.
        </p>
        <button onClick={handleSignOutAll} className="btn btn-danger w-full">
          Wyloguj ze wszystkich urządzeń
        </button>
      </div>
    </div>
  )
}

