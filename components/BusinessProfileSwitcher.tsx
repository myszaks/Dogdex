'use client'

import { useRouter } from 'next/navigation'
import { Building2, Loader2 } from 'lucide-react'
import { useState } from 'react'

export default function BusinessProfileSwitcher({ profiles, activeProfileId }: { profiles: Array<{ id: string; name: string }>; activeProfileId: string | null }) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  if (profiles.length < 2) return null

  async function change(profileId: string) {
    setSaving(true)
    const response = await fetch('/api/business-profiles/active', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ profileId }) })
    setSaving(false)
    if (response.ok) router.refresh()
  }

  return <label htmlFor="active-business-profile" className="flex min-w-64 items-center gap-2 rounded-2xl border border-border bg-white px-3 py-2 text-sm">
    {saving ? <Loader2 className="h-4 w-4 animate-spin text-accent" /> : <Building2 className="h-4 w-4 text-accent" />}
    <span className="sr-only">Aktywny profil</span>
    <select id="active-business-profile" className="min-w-0 flex-1 bg-transparent font-semibold outline-none" value={activeProfileId ?? ''} disabled={saving} onChange={event => void change(event.target.value)}>
      {profiles.map(profile => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
    </select>
  </label>
}
