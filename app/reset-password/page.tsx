'use client'
import { useState, useEffect, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'

function checkPassword(pw: string) {
  return {
    length:  pw.length >= 9,
    upper:   /[A-Z]/.test(pw),
    digit:   /[0-9]/.test(pw),
    special: /[^A-Za-z0-9]/.test(pw),
  }
}

function ResetPasswordForm() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [sessionReady, setSessionReady] = useState(false)

  const pwChecks = checkPassword(password)
  const pwValid = Object.values(pwChecks).every(Boolean)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setSessionReady(true)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') setSessionReady(true)
    })
    return () => subscription.unsubscribe()
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!pwValid) {
      setError('Hasło nie spełnia wymagań złożoności.')
      return
    }
    if (password !== confirm) {
      setError('Hasła nie są zgodne.')
      return
    }

    setLoading(true)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    setLoading(false)

    if (updateError) {
      const msg = updateError.message.toLowerCase()
      if (msg.includes('same password') || msg.includes('different from the old password') || msg.includes('should be different')) {
        setError('Nowe hasło musi być inne niż poprzednie.')
      } else {
        setError(updateError.message)
      }
    } else {
      setSuccess(true)
      setTimeout(() => router.push('/'), 2500)
    }
  }

  if (success) {
    return (
      <div className="card text-center py-10 space-y-3">
        <p className="text-4xl">✅</p>
        <p className="text-lg font-semibold text-slate-800">Hasło zostało zmienione!</p>
        <p className="text-sm text-slate-500">Za chwilę zostaniesz przekierowany na stronę główną…</p>
      </div>
    )
  }

  if (!sessionReady) {
    return (
      <div className="card text-center py-10 space-y-3">
        <p className="text-3xl animate-pulse">🔐</p>
        <p className="text-slate-600">Weryfikacja linku resetowania hasła…</p>
        <p className="text-xs text-slate-400 mt-2">
          Jeśli ta strona się nie odświeży, wróć do e-maila i kliknij link ponownie.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="card space-y-4">
      <div>
        <label className="form-label">Nowe hasło</label>
        <input
          className="form-input"
          type="password"
          autoComplete="new-password"
          placeholder="Minimum 9 znaków"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
        />
        {password.length > 0 && (
          <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1">
            {([
              [pwChecks.length,  'Min. 9 znaków'],
              [pwChecks.upper,   'Duża litera'],
              [pwChecks.digit,   'Cyfra'],
              [pwChecks.special, 'Znak specjalny'],
            ] as [boolean, string][]).map(([ok, label]) => (
              <span key={label} className={`flex items-center gap-1 text-xs ${ok ? 'text-green-600' : 'text-slate-400'}`}>
                <span>{ok ? '✓' : '○'}</span>{label}
              </span>
            ))}
          </div>
        )}
      </div>
      <div>
        <label className="form-label">Powtórz hasło</label>
        <input
          className="form-input"
          type="password"
          autoComplete="new-password"
          placeholder="Wpisz hasło ponownie"
          value={confirm}
          onChange={e => setConfirm(e.target.value)}
          required
        />
        {confirm.length > 0 && (
          <p className={`mt-1 text-xs flex items-center gap-1 ${password === confirm ? 'text-green-600' : 'text-red-500'}`}>
            <span>{password === confirm ? '✓' : '○'}</span>
            {password === confirm ? 'Hasła są zgodne' : 'Hasła nie są zgodne'}
          </p>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading || !pwValid || password !== confirm}
        className="btn btn-primary w-full"
      >
        {loading ? 'Zapisywanie…' : '🔑 Ustaw nowe hasło'}
      </button>
    </form>
  )
}

export default function ResetPasswordPage() {
  return (
    <div className="max-w-md mx-auto py-10">
      <h1 className="page-title mb-6">🔐 Resetowanie hasła</h1>
      <Suspense fallback={<div className="card text-center py-8 text-slate-500">Ładowanie…</div>}>
        <ResetPasswordForm />
      </Suspense>
    </div>
  )
}

