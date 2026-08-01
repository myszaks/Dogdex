"use client"

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Modal from './Modal'
import { requireSupabaseBrowserClient } from '@/lib/supabaseClient'
import { fetchWithAuthRetry } from '@/lib/authFetch'

type View = 'login' | 'register' | 'forgot'
type Props = { open: boolean; onClose: () => void }

type ResetCooldown = {
  email: string
  until: number
}

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

function formatCooldown(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

export default function AuthModal({ open, onClose }: Props) {
  const router = useRouter()
  const [view, setView] = useState<View>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [company, setCompany] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [emailConflict, setEmailConflict] = useState(false)
  const [resetCooldown, setResetCooldown] = useState<ResetCooldown | null>(null)
  const [cooldownNow, setCooldownNow] = useState(Date.now())

  const normalizedEmail = normalizeEmail(email)

  function reset() {
    setError(null)
    setSuccess(null)
    setEmailConflict(false)
  }

  function switchView(v: View) {
    reset()
    setView(v)
  }

  useEffect(() => {
    if (!resetCooldown || resetCooldown.until <= Date.now()) return
    const timer = window.setInterval(() => {
      setCooldownNow(Date.now())
    }, 1000)
    return () => window.clearInterval(timer)
  }, [resetCooldown])

  useEffect(() => {
    if (resetCooldown && cooldownNow >= resetCooldown.until) {
      setResetCooldown(null)
    }
  }, [cooldownNow, resetCooldown])

  function checkPassword(pw: string) {
    return {
      length: pw.length >= 9,
      upper: /[A-Z]/.test(pw),
      digit: /[0-9]/.test(pw),
      special: /[^A-Za-z0-9]/.test(pw),
    }
  }

  const pwChecks = checkPassword(password)
  const pwValid = Object.values(pwChecks).every(Boolean)

  const cooldownLeftSeconds =
    resetCooldown && resetCooldown.email === normalizedEmail
      ? Math.max(0, Math.ceil((resetCooldown.until - cooldownNow) / 1000))
      : 0

  const resetBlocked = cooldownLeftSeconds > 0

  function translateAuthError(msg: string): string {
    const m = msg.toLowerCase()
    if (m.includes('invalid login credentials') || m.includes('invalid credentials')) return 'Nieprawidłowy adres e-mail lub hasło.'
    if (m.includes('email not confirmed')) return 'Adres e-mail nie został potwierdzony. Sprawdź skrzynkę.'
    if (m.includes('too many requests')) return 'Zbyt wiele prób logowania. Spróbuj ponownie za chwilę.'
    if (m.includes('user not found')) return 'Nie znaleziono konta z tym adresem e-mail.'
    if (m.includes('anonymous sign-ins are disabled')) return 'Podaj adres e-mail i hasło.'
    if (m.includes('unable to validate email') || m.includes('invalid format')) return 'Nieprawidłowy format adresu e-mail.'
    if (m.includes('network') || m.includes('fetch')) return 'Błąd połączenia. Sprawdź internet i spróbuj ponownie.'
    return msg
  }

  async function signInWithEmail() {
    const supabase = requireSupabaseBrowserClient()
    setLoading(true)
    reset()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setLoading(false)
      setError(translateAuthError(error.message))
      return
    }

    // Logowanie zakończyło się już powodzeniem. Zamknij modal od razu, a
    // synchronizację sesji z endpointami serwerowymi dokończ w tle.
    setLoading(false)
    onClose()
    router.refresh()

    let profileResponse = await fetchWithAuthRetry('/api/profile')
    if (profileResponse.status === 401) {
      const { error: refreshError } = await supabase.auth.refreshSession()
      if (!refreshError) {
        profileResponse = await fetchWithAuthRetry('/api/profile')
      }
    }
    // Drugi refresh odświeża komponenty serwerowe już po zapisaniu ciasteczek.
    router.refresh()
  }

  async function signUpWithEmail() {
    const supabase = requireSupabaseBrowserClient()
    if (!pwValid) {
      setError('Hasło nie spełnia wymagań złożoności.')
      return
    }

    setLoading(true)
    reset()
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
        setError(translateAuthError(error.message))
      }
    } else if (
      data.user &&
      Array.isArray((data.user as { identities?: unknown[] }).identities) &&
      (data.user as { identities?: unknown[] }).identities?.length === 0
    ) {
      setEmailConflict(true)
    } else {
      setSuccess('Sprawdź swoją skrzynkę e-mail i potwierdź konto.')
    }
  }

  async function signInWithGoogle() {
    const supabase = requireSupabaseBrowserClient()
    setLoading(true)
    reset()
    const origin = process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${origin}/auth/callback` },
    })
    setLoading(false)
    if (error) setError(translateAuthError(error.message))
  }

  async function sendResetEmail() {
    if (resetBlocked) {
      setError(`Odczekaj ${formatCooldown(cooldownLeftSeconds)} przed kolejnym wysłaniem linku.`)
      return
    }

    setLoading(true)
    reset()
    const response = await fetch('/api/auth/password-reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    const data = await response.json().catch(() => ({}))
    setLoading(false)

    if (!response.ok) {
      if (response.status === 429) {
        const retryAfterSeconds = typeof data?.retryAfterSeconds === 'number' ? data.retryAfterSeconds : 300
        setResetCooldown({
          email: normalizedEmail,
          until: Date.now() + retryAfterSeconds * 1000,
        })
        setCooldownNow(Date.now())
        setError('Link do resetowania hasła można wysłać tylko raz na 5 minut.')
      } else {
        setError(translateAuthError(String(data?.error ?? 'Nie udało się wysłać linku resetującego.')))
      }
      return
    }

    const retryAfterSeconds = typeof data?.retryAfterSeconds === 'number' ? data.retryAfterSeconds : 300
    setResetCooldown({
      email: normalizedEmail,
      until: Date.now() + retryAfterSeconds * 1000,
    })
    setCooldownNow(Date.now())
    setSuccess('Link do resetowania hasła został wysłany na podany adres.')
  }

  const titles: Record<View, string> = {
    login: 'Zaloguj się',
    register: 'Utwórz konto',
    forgot: 'Resetuj hasło',
  }

  return (
    <Modal open={open} onClose={onClose} title={titles[view]}>
      <div className="space-y-4">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
            {error}
          </div>
        )}

        {success && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700">
            {success}
          </div>
        )}

        {view === 'login' && (
          <div className="space-y-3">
            <input
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="E-mail"
              className="form-input"
              autoComplete="email"
            />
            <input
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Hasło"
              type="password"
              className="form-input"
              autoComplete="current-password"
            />
            <button className="btn btn-primary w-full" onClick={signInWithEmail} disabled={loading}>
              {loading ? 'Logowanie…' : 'Zaloguj się'}
            </button>
            <div className="relative my-1">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center">
                <span className="bg-card px-3 text-xs text-muted-foreground">lub</span>
              </div>
            </div>
            <GoogleButton disabled={loading} onClick={signInWithGoogle} />
            <div className="flex justify-between text-sm pt-1">
              <button onClick={() => switchView('forgot')} className="text-accent hover:text-orange-600 font-medium transition-colors">
                Zapomniałem hasła
              </button>
              <button onClick={() => switchView('register')} className="text-accent hover:text-orange-600 font-medium transition-colors">
                Utwórz konto
              </button>
            </div>
          </div>
        )}

        {view === 'register' && (
          <div className="space-y-3">
            {success ? (
              <div className="space-y-4 py-2 text-center">
                <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
                  <span className="text-2xl">✉️</span>
                </div>
                <p className="text-sm text-emerald-700 font-medium">{success}</p>
                <p className="text-xs text-muted-foreground">Sprawdź też folder spam.</p>
                <button onClick={() => switchView('login')} className="btn btn-secondary w-full">
                  Wróć do logowania
                </button>
              </div>
            ) : (
              <>
                <input
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  placeholder="Imię i nazwisko (opcjonalne)"
                  className="form-input"
                  autoComplete="name"
                />
                <input
                  value={company}
                  onChange={e => setCompany(e.target.value)}
                  placeholder="Firma / klub (opcjonalne)"
                  className="form-input"
                  autoComplete="organization"
                />
                <input
                  value={email}
                  onChange={e => { setEmail(e.target.value); setEmailConflict(false) }}
                  placeholder="E-mail"
                  className="form-input"
                  autoComplete="email"
                />
                {emailConflict && (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 space-y-3">
                    <p className="text-sm text-amber-800 font-semibold">Ten adres e-mail jest już zarejestrowany.</p>
                    <p className="text-xs text-amber-700">Być może logowałeś się wcześniej przez Google.</p>
                    <div className="space-y-2">
                      <GoogleButton disabled={loading} onClick={signInWithGoogle} />
                      <button
                        type="button"
                        className="w-full text-sm text-accent hover:text-orange-600 font-medium transition-colors"
                        onClick={() => switchView('forgot')}
                      >
                        Wyślij link do resetowania hasła
                      </button>
                    </div>
                  </div>
                )}
                <div>
                  <input
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Hasło"
                    type="password"
                    className="form-input"
                    autoComplete="new-password"
                  />
                  {password.length > 0 && (
                    <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
                      {([
                        [pwChecks.length, 'Min. 9 znaków'],
                        [pwChecks.upper, 'Duża litera'],
                        [pwChecks.digit, 'Cyfra'],
                        [pwChecks.special, 'Znak specjalny'],
                      ] as [boolean, string][]).map(([ok, label]) => (
                        <span key={label} className={`flex items-center gap-1 text-xs ${ok ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                          <span className="font-bold">{ok ? '✓' : '○'}</span>
                          {label}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <button className="btn btn-primary w-full" onClick={signUpWithEmail} disabled={loading || emailConflict || !pwValid}>
                  {loading ? 'Tworzenie konta…' : 'Zarejestruj się'}
                </button>
                <div className="relative my-1">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-border" />
                  </div>
                  <div className="relative flex justify-center">
                    <span className="bg-card px-3 text-xs text-muted-foreground">lub</span>
                  </div>
                </div>
                <GoogleButton disabled={loading} onClick={signInWithGoogle} />
                <p className="text-sm text-center pt-1">
                  Masz już konto?{' '}
                  <button onClick={() => switchView('login')} className="text-accent hover:text-orange-600 font-medium transition-colors">
                    Zaloguj się
                  </button>
                </p>
              </>
            )}
          </div>
        )}

        {view === 'forgot' && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Podaj swój adres e-mail, a wyślemy Ci link do resetowania hasła.
            </p>
            <input
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="E-mail"
              className="form-input"
              autoComplete="email"
            />
            <button className="btn btn-primary w-full" onClick={sendResetEmail} disabled={loading || resetBlocked}>
              {loading ? 'Wysyłanie…' : resetBlocked ? `Odczekaj ${formatCooldown(cooldownLeftSeconds)}` : 'Wyślij link'}
            </button>
            {resetBlocked && (
              <p className="text-xs text-center text-slate-500">
                Dla tego adresu kolejny link wyślesz za {formatCooldown(cooldownLeftSeconds)}.
              </p>
            )}
            <p className="text-sm text-center pt-1">
              <button onClick={() => switchView('login')} className="text-accent hover:text-orange-600 font-medium transition-colors">
                Wróć do logowania
              </button>
            </p>
          </div>
        )}
      </div>
    </Modal>
  )
}
