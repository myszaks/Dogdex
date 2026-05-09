import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="text-center py-20">
      <p className="text-6xl mb-4">🐾</p>
      <h1 className="text-2xl font-bold text-slate-800 mb-2">Strona nie istnieje</h1>
      <p className="text-slate-500 mb-6">Nie znaleziono żądanej strony.</p>
      <Link href="/" className="btn btn-primary">
        Wróć na stronę główną
      </Link>
    </div>
  )
}
