'use client'

import { useState } from 'react'
import { FileUp, Loader2 } from 'lucide-react'

function parseCsv(text: string) {
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  if (lines.length < 2) throw new Error('Plik CSV nie zawiera danych')
  const separator = lines[0].includes(';') ? ';' : ','
  const headers = lines[0].split(separator).map(value => value.trim().toLowerCase())
  const index = (names: string[]) => headers.findIndex(header => names.includes(header))
  const registrationIndex = index(['registration_id', 'registrationid', 'registration'])
  const participantIndex = index(['participant_id', 'participantid', 'participant'])
  const timeIndex = index(['time_ms', 'timems', 'time'])
  const run1Index = index(['run1_ms', 'run1ms', 'run1'])
  const run2Index = index(['run2_ms', 'run2ms', 'run2'])
  const notesIndex = index(['notes', 'note'])
  if (registrationIndex < 0 && participantIndex < 0) throw new Error('CSV wymaga kolumny registration_id lub participant_id')
  if (timeIndex < 0 && run1Index < 0 && run2Index < 0) throw new Error('CSV wymaga kolumny time_ms, run1_ms lub run2_ms')
  const number = (values: string[], position: number) => position < 0 || !values[position] ? null : Number(values[position])
  return lines.slice(1).map(line => {
    const values = line.split(separator).map(value => value.trim())
    return {
      registrationId: registrationIndex >= 0 ? values[registrationIndex] : undefined,
      participantId: participantIndex >= 0 ? values[participantIndex] : undefined,
      timeMs: number(values, timeIndex),
      run1Ms: number(values, run1Index),
      run2Ms: number(values, run2Index),
      notes: notesIndex >= 0 ? values[notesIndex] : undefined,
    }
  })
}

export default function TimingImportPanel({ eventId }: { eventId: string }) {
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function importFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    setLoading(true)
    setMessage(null)
    try {
      const rows = parseCsv(await file.text())
      const response = await fetch(`/api/events/${eventId}/timing-import`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sourceName: file.name, rows }),
      })
      const data = await response.json()
      if (!response.ok && !data.imported) throw new Error(data.error ?? 'Import nie powiódł się')
      setMessage(`Zaimportowano ${data.imported} wyników; odrzucono ${data.rejected}. Odśwież stronę, aby zobaczyć zmiany.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Nie udało się odczytać pliku')
    } finally {
      setLoading(false)
      event.target.value = ''
    }
  }

  return (
    <details className="card mb-5">
      <summary className="flex cursor-pointer list-none items-center gap-2 font-semibold"><FileUp className="h-4 w-4 text-accent" /> Import z systemu pomiaru czasu</summary>
      <div className="mt-4 space-y-3 border-t border-border pt-4">
        <p className="text-sm text-muted-foreground">CSV: <code>registration_id,time_ms</code> albo <code>participant_id,run1_ms,run2_ms</code>. Adapter jest niezależny od producenta urządzenia.</p>
        <label htmlFor={`timing-import-${eventId}`} className="btn btn-secondary btn-sm inline-flex cursor-pointer">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />} Wybierz CSV
          <input id={`timing-import-${eventId}`} type="file" accept=".csv,text/csv" className="sr-only" disabled={loading} onChange={importFile} />
        </label>
        {message && <p role="status" className="text-sm">{message}</p>}
      </div>
    </details>
  )
}
