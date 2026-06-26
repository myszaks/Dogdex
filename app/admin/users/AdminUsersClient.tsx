'use client'
import { useEffect, useState } from 'react'

type Profile = {
  id: string
  role: string
  full_name: string | null
  company: string | null
  created_at: string
}

const ALL_ROLES = ['user', 'organizer', 'admin']
const ROLE_LABELS: Record<string, string> = {
  user: 'Użytkownik',
  organizer: 'Organizator',
  admin: 'Administrator',
}

export default function AdminUsersClient() {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/admin/users')
      .then(r => r.json())
      .then(data => { setProfiles(data); setLoading(false) })
      .catch(() => { setError('Błąd pobierania użytkowników'); setLoading(false) })
  }, [])

  async function changeRole(id: string, role: string) {
    setSaving(id)
    setError(null)
    const res = await fetch('/api/admin/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, role }),
    })
    const json = await res.json()
    setSaving(null)
    if (!res.ok) {
      setError(json.error ?? 'Błąd zmiany roli')
    } else {
      setProfiles(prev => prev.map(p => p.id === id ? { ...p, role: json.role } : p))
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-800 mb-6">👥 Zarządzanie użytkownikami</h1>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      {loading ? (
        <p className="text-slate-500">Ładowanie…</p>
      ) : profiles.length === 0 ? (
        <p className="text-slate-500">Brak użytkowników.</p>
      ) : (
        <div className="card overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Użytkownik</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">ID</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Rola</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {profiles.map(p => (
                <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-800">{p.full_name || <span className="text-slate-400 italic">Brak nazwy</span>}</p>
                    {p.company && <p className="text-xs text-slate-500">{p.company}</p>}
                  </td>
                  <td className="px-4 py-3 text-slate-400 font-mono text-xs truncate max-w-[140px]">
                    {p.id}
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={p.role}
                      disabled={saving === p.id}
                      onChange={e => changeRole(p.id, e.target.value)}
                      className="form-input w-36 py-1"
                    >
                      {ALL_ROLES.map(r => (
                        <option key={r} value={r}>{ROLE_LABELS[r] ?? 'Nieznana rola'}</option>
                      ))}
                    </select>
                    {saving === p.id && (
                      <span className="ml-2 text-xs text-slate-400">Zapisywanie…</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
