'use client'

import { useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'

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

  // --- Change email ---
  const [newEmail, setNewEmail] = useState('')
  const [emailLoading, setEmailLoading] = useState(false)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [emailSuccess, setEmailSuccess] = useState(false)

  const pwChecks = checkPassword(newPw)
  const pwValid = Object.values(pwChecks).every(Boolean)

  async function handleChangePassword(e: React.FormEvent) {
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

  async function handleChangeEmail(e: React.FormEvent) {
    e.preventDefault()
    setEmailError(null)
    setEmailSuccess(false)
    if (!newEmail || newEmail === email) { setEmailError('Podaj nowy adres e-mail.'); return }

    setEmailLoading(true)
    const { error } = await supabase.auth.updateUser({ email: newEmail })
    setEmailLoading(false)
    if (error) {
      setEmailError(error.message)
    } else {
      setEmailSuccess(true)
      setNewEmail('')
    }
  }

  async function handleSignOutAll() {
    await supabase.auth.signOut({ scope: 'global' })
    window.location.href = '/'
  }

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/profile" className="text-slate-400 hover:text-slate-600 text-sm">← Profil</Link>
        <h1 className="page-title mb-0">⚙️ Ustawienia konta</h1>
      </div>

      {/* Change password */}
      {isEmailProvider ? (
        <form onSubmit={handleChangePassword} className="card space-y-4">
          <h2 className="font-semibold text-slate-800">Zmiana hasła</h2>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Obecne hasło</label>
            <input
              type="password"
              value={currentPw}
              onChange={e => setCurrentPw(e.target.value)}
              className="input w-full"
              autoComplete="current-password"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Nowe hasło</label>
            <input
              type="password"
              value={newPw}
              onChange={e => setNewPw(e.target.value)}
              className="input w-full"
              autoComplete="new-password"
              placeholder="Min. 9 znaków"
              required
            />
            {newPw.length > 0 && (
              <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5">
                {([
                  [pwChecks.length, 'Min. 9 znaków'],
                  [pwChecks.upper, 'Duża litera'],
                  [pwChecks.digit, 'Cyfra'],
                  [pwChecks.special, 'Znak specjalny'],
                ] as [boolean, string][]).map(([ok, label]) => (
                  <span key={label} className={`text-xs flex items-center gap-1 ${ok ? 'text-green-600' : 'text-slate-400'}`}>
                    {ok ? '✓' : '○'} {label}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Powtórz nowe hasło</label>
            <input
              type="password"
              value={confirmPw}
              onChange={e => setConfirmPw(e.target.value)}
              className="input w-full"
              autoComplete="new-password"
              required
            />
            {confirmPw.length > 0 && newPw !== confirmPw && (
              <p className="text-xs text-red-500 mt-1">Hasła nie są zgodne</p>
            )}
          </div>

          {pwError && <p className="text-red-600 text-sm">{pwError}</p>}
          {pwSuccess && <p className="text-green-600 text-sm">✓ Hasło zostało zmienione!</p>}

          <button type="submit" disabled={pwLoading} className="btn btn-primary w-full">
            {pwLoading ? 'Zmienianie…' : 'Zmień hasło'}
          </button>
        </form>
      ) : (
        <div className="card text-center py-6 space-y-2">
          <p className="text-2xl">🔑</p>
          <p className="text-slate-600 text-sm">
            Twoje konto jest połączone z <strong>{provider}</strong>.<br/>
            Zmiana hasła odbywa się przez dostawcę logowania.
          </p>
        </div>
      )}

      {/* Change email */}
      <form onSubmit={handleChangeEmail} className="card space-y-4">
        <h2 className="font-semibold text-slate-800">Zmiana adresu e-mail</h2>
        <p className="text-sm text-slate-500">Obecny adres: <strong>{email}</strong></p>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Nowy adres e-mail</label>
          <input
            type="email"
            value={newEmail}
            onChange={e => setNewEmail(e.target.value)}
            className="input w-full"
            placeholder="nowy@email.com"
            autoComplete="email"
          />
        </div>
        {emailError && <p className="text-red-600 text-sm">{emailError}</p>}
        {emailSuccess && (
          <p className="text-green-600 text-sm">
            ✓ Link potwierdzający wysłany na <strong>{newEmail || 'nowy adres'}</strong>. Sprawdź skrzynkę.
          </p>
        )}
        <button type="submit" disabled={emailLoading} className="btn btn-primary w-full">
          {emailLoading ? 'Wysyłanie…' : 'Zmień e-mail'}
        </button>
      </form>

      {/* Sign out all devices */}
      <div className="card space-y-3">
        <h2 className="font-semibold text-slate-800">Bezpieczeństwo</h2>
        <p className="text-sm text-slate-500">
          Wyloguj się ze wszystkich urządzeń i sesji jednocześnie.
        </p>
        <button
          onClick={handleSignOutAll}
          className="btn w-full border border-red-200 text-red-600 hover:bg-red-50 bg-white"
        >
          Wyloguj ze wszystkich urządzeń
        </button>
      </div>
    </div>
  )
}
