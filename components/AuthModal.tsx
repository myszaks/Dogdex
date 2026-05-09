"use client"
import { useState } from 'react'
import Modal from './Modal'
import { supabase } from '@/lib/supabaseClient'

type View = 'login' | 'register' | 'forgot'
type Props = { open: boolean; onClose: () => void }

// ── Branded OAuth buttons ────────────────────────────────────────────────────

function GoogleButton({ disabled, onClick }: { disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex items-center justify-center gap-3 w-full border border-slate-300 rounded-lg px-4 py-2 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
        <path fill="#4285F4" d="M47.53 24.56c0-1.64-.15-3.22-.42-4.74H24v8.98h13.22c-.57 3.01-2.3 5.56-4.9 7.27v6.04h7.93c4.64-4.28 7.28-10.58 7.28-17.55z"/>
        <path fill="#34A853" d="M24 48c6.48 0 11.92-2.15 15.89-5.83l-7.93-6.04c-2.15 1.44-4.9 2.29-7.96 2.29-6.12 0-11.3-4.13-13.16-9.69H2.64v6.23C6.59 42.68 14.73 48 24 48z"/>
        <path fill="#FBBC05" d="M10.84 28.73A14.9 14.9 0 0 1 9.9 24c0-1.65.28-3.25.79-4.73v-6.23H2.64A23.93 23.93 0 0 0 0 24c0 3.87.92 7.53 2.64 10.96l8.2-6.23z"/>
        <path fill="#EA4335" d="M24 9.58c3.45 0 6.55 1.19 8.99 3.52l6.74-6.74C35.9 2.38 30.46 0 24 0 14.73 0 6.59 5.32 2.64 13.04l8.2 6.23C12.7 13.71 17.88 9.58 24 9.58z"/>
      </svg>
      Kontynuuj z Google
    </button>
  )
}

function AppleButton({ disabled }: { disabled: boolean }) {
  return (
    <button
      type="button"
      disabled
      title="Logowanie przez Apple – wkrótce dostępne"
      className="relative flex items-center justify-center gap-3 w-full rounded-lg px-4 py-2 bg-black text-sm font-medium text-white opacity-50 cursor-not-allowed select-none"
    >
      <svg width="16" height="18" viewBox="0 0 814 1000" aria-hidden="true" fill="white">
        <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76 0-103.7 40.8-165.9 40.8s-105-57.8-155.5-127.4C46 376.7 0 248.3 0 125.6c0-70 23.8-142.6 68.7-199.1C98.9 88.7 143.6 58 194.4 38.2c39.4-15.3 86.3-23.8 138.7-23.8 50.7 0 100.7 19.6 138.7 42.7 38.4 23.4 76.5 59.5 101.6 59.5 0 0 26.2-18.2 63-40.8 36.8-22.6 83.1-40.8 137.5-40.8 0 0-1.3.1-3.4.2z"/>
      </svg>
      Kontynuuj z Apple
      <span className="absolute -top-1.5 -right-1.5 bg-amber-400 text-white text-[10px] font-bold px-1 rounded">wkrótce</span>
    </button>
  )
}

// ────────────────────────────────────────────────────────────────────────────

export default function AuthModal({ open, onClose }: Props) {
  const [view, setView] = useState<View>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [company, setCompany] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [emailConflict, setEmailConflict] = useState(false)

  function reset() { setError(null); setSuccess(null); setEmailConflict(false) }
  function switchView(v: View) { reset(); setView(v) }

  function checkPassword(pw: string) {
    return {
      length:  pw.length >= 9,
      upper:   /[A-Z]/.test(pw),
      digit:   /[0-9]/.test(pw),
      special: /[^A-Za-z0-9]/.test(pw),
    }
  }
  const pwChecks = checkPassword(password)
  const pwValid  = Object.values(pwChecks).every(Boolean)

  async function signInWithEmail() {
    setLoading(true); reset()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) setError(error.message)
    else onClose()
  }

  async function signUpWithEmail() {
    if (!pwValid) { setError('Hasło nie spełnia wymagań złożoności.'); return }
    setLoading(true); reset()
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName.trim() || undefined,
          company: company.trim() || undefined,
        },
      },
    })
    setLoading(false)
    if (error) {
      const msg = error.message.toLowerCase()
      if (msg.includes('already registered') || msg.includes('already exists') || msg.includes('user already')) {
        setEmailConflict(true)
      } else {
        setError(error.message)
      }
    } else if (data.user && Array.isArray((data.user as any).identities) && (data.user as any).identities.length === 0) {
      // Email enumeration protection: Supabase returns fake success with empty identities
      // when the email is already registered
      setEmailConflict(true)
    } else {
      setSuccess('Sprawdź swoją skrzynkę e-mail i potwierdź konto.')
    }
  }

  async function signInWithGoogle() {
    setLoading(true); reset()
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
    setLoading(false)
    if (error) setError(error.message)
  }

  async function sendResetEmail() {
    setLoading(true); reset()
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    })
    setLoading(false)
    if (error) setError(error.message)
    else setSuccess('Link do resetowania hasła został wysłany na podany adres.')
  }

  const titles: Record<View, string> = {
    login: 'Zaloguj się',
    register: 'Utwórz konto',
    forgot: 'Resetuj hasło',
  }

  return (
    <Modal open={open} onClose={onClose}>
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">{titles[view]}</h3>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {success && <p className="text-sm text-green-600">{success}</p>}

        {/* === LOGIN === */}
        {view === 'login' && (
          <div className="space-y-2">
            <input value={email} onChange={e => setEmail(e.target.value)}
              placeholder="Email" className="form-input" autoComplete="email" />
            <input value={password} onChange={e => setPassword(e.target.value)}
              placeholder="Hasło" type="password" className="form-input" autoComplete="current-password" />
            <button className="btn btn-primary w-full" onClick={signInWithEmail} disabled={loading}>
              {loading ? 'Logowanie…' : 'Zaloguj się'}
            </button>
            <div className="relative my-1">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200" /></div>
              <div className="relative flex justify-center"><span className="bg-white px-2 text-xs text-slate-400">lub</span></div>
            </div>
            <div className="space-y-2">
              <GoogleButton disabled={loading} onClick={signInWithGoogle} />
            </div>
            <div className="flex justify-between text-sm pt-1">
              <button onClick={() => switchView('forgot')} className="text-sky-600 hover:underline">
                Zapomniałem hasła
              </button>
              <button onClick={() => switchView('register')} className="text-sky-600 hover:underline">
                Utwórz konto
              </button>
            </div>
          </div>
        )}

        {/* === REGISTER === */}
        {view === 'register' && (
          <div className="space-y-2">
            {success ? (
              <div className="space-y-4 py-2">
                <div className="flex flex-col items-center gap-2 text-center">
                  <span className="text-3xl">✉️</span>
                  <p className="text-sm text-green-700 font-medium">{success}</p>
                  <p className="text-xs text-slate-500">Sprawdź też folder spam, jeśli mail nie dotarł.</p>
                </div>
                <button onClick={() => switchView('login')} className="btn btn-secondary w-full">
                  Wróć do logowania
                </button>
              </div>
            ) : (
              <>
                <input value={fullName} onChange={e => setFullName(e.target.value)}
                  placeholder="Imię i nazwisko (opcjonalne)" className="form-input" autoComplete="name" />
                <input value={company} onChange={e => setCompany(e.target.value)}
                  placeholder="Firma / klub (opcjonalne)" className="form-input" autoComplete="organization" />
                <input value={email} onChange={e => { setEmail(e.target.value); setEmailConflict(false) }}
                  placeholder="Email" className="form-input" autoComplete="email" />
                {emailConflict && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 space-y-2">
                    <p className="text-sm text-amber-800 font-medium">Ten adres e-mail jest już zarejestrowany.</p>
                    <p className="text-xs text-amber-700">Być może logowałeś się wcześniej przez Google. Możesz:</p>
                    <div className="space-y-1.5">
                      <GoogleButton disabled={loading} onClick={signInWithGoogle} />
                      <button
                        type="button"
                        className="w-full text-sm text-sky-600 hover:underline"
                        onClick={() => { switchView('forgot') }}
                      >
                        Wyślij link do resetowania hasła
                      </button>
                    </div>
                  </div>
                )}
                <div>
                  <input value={password} onChange={e => setPassword(e.target.value)}
                    placeholder="Hasło" type="password" className="form-input" autoComplete="new-password" />
                  {password.length > 0 && (
                    <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1">
                      {([
                        [pwChecks.length,  'Min. 9 znaków'],
                        [pwChecks.upper,   'Duża litera'],
                        [pwChecks.digit,   'Cyfra'],
                        [pwChecks.special, 'Znak specjalny'],
                      ] as [boolean, string][]).map(([ok, label]) => (
                        <span key={label} className={`flex items-center gap-1 text-xs ${ ok ? 'text-green-600' : 'text-slate-400' }`}>
                          <span>{ok ? '✓' : '○'}</span>{label}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <button className="btn btn-primary w-full" onClick={signUpWithEmail} disabled={loading || emailConflict || !pwValid}>
                  {loading ? 'Tworzenie konta…' : 'Zarejestruj się'}
                </button>
                <div className="relative my-1">
                  <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200" /></div>
                  <div className="relative flex justify-center"><span className="bg-white px-2 text-xs text-slate-400">lub</span></div>
                </div>
                <div className="space-y-2">
                  <GoogleButton disabled={loading} onClick={signInWithGoogle} />
                </div>
                <p className="text-sm text-center pt-1">
                  Masz już konto?{' '}
                  <button onClick={() => switchView('login')} className="text-sky-600 hover:underline">
                    Zaloguj się
                  </button>
                </p>
              </>
            )}
          </div>
        )}

        {/* === FORGOT PASSWORD === */}
        {view === 'forgot' && (
          <div className="space-y-2">
            <p className="text-sm text-slate-500">
              Podaj swój adres e-mail, a wyślemy Ci link do resetowania hasła.
            </p>
            <input value={email} onChange={e => setEmail(e.target.value)}
              placeholder="Email" className="form-input" autoComplete="email" />
            <button className="btn btn-primary w-full" onClick={sendResetEmail} disabled={loading}>
              {loading ? 'Wysyłanie…' : 'Wyślij link'}
            </button>
            <p className="text-sm text-center pt-1">
              <button onClick={() => switchView('login')} className="text-sky-600 hover:underline">
                Wróć do logowania
              </button>
            </p>
          </div>
        )}
      </div>
    </Modal>
  )
}
