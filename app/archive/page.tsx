import { permanentRedirect } from 'next/navigation'

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function ArchiveRedirectPage({ searchParams }: Props) {
  const incoming = await searchParams
  const target = new URLSearchParams({ widok: 'archiwum' })

  for (const [key, value] of Object.entries(incoming)) {
    if (key === 'widok' || value == null) continue
    if (Array.isArray(value)) {
      for (const item of value) target.append(key, item)
    } else {
      target.set(key, value)
    }
  }

  permanentRedirect(`/?${target.toString()}`)
}
