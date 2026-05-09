'use client'

export default function CsvExportButton({ eventId }: { eventId: string }) {
  return (
    <a
      href={`/api/registrations/export?eventId=${encodeURIComponent(eventId)}`}
      download
      className="btn btn-secondary btn-sm"
    >
      ⬇️ Eksportuj CSV
    </a>
  )
}
