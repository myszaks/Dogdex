'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, CalendarCheck, CircleDollarSign, Star, TrendingUp, XCircle } from 'lucide-react'
import type { TrainingAnalyticsResult, TrainingAnalyticsRange } from '@/lib/trainingAnalytics'

type AnalyticsResponse = TrainingAnalyticsResult & { range: TrainingAnalyticsRange }

function money(value: number, currency: string) {
  return value.toLocaleString('pl-PL', { style: 'currency', currency })
}

export default function TrainerAnalyticsPage() {
  const [range, setRange] = useState<TrainingAnalyticsRange>('90d')
  const [data, setData] = useState<AnalyticsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch(`/api/trainer/analytics?range=${range}`)
      .then(async response => {
        const payload = await response.json().catch(() => null)
        if (!response.ok) throw new Error(payload?.error || 'Nie udało się pobrać analityki')
        return payload
      })
      .then(payload => {
        if (!cancelled) setData(payload)
      })
      .catch(loadError => {
        if (!cancelled) setError((loadError as Error).message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [range])

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-8">
        <div>
          <Link href="/trainer" className="inline-flex items-center gap-2 text-accent hover:underline mb-4">
            <ArrowLeft className="w-4 h-4" />
            Wróć do panelu
          </Link>
          <h1 className="page-title">Analityka treningów</h1>
          <p className="text-muted-foreground mt-2">Rezerwacje, przychód i jakość obsługi w jednym miejscu.</p>
        </div>
        <label htmlFor="analytics-range" className="text-sm font-semibold">
          Zakres
          <select
            id="analytics-range"
            value={range}
            onChange={event => setRange(event.target.value as TrainingAnalyticsRange)}
            className="form-input mt-2 min-w-44"
          >
            <option value="30d">Ostatnie 30 dni</option>
            <option value="90d">Ostatnie 90 dni</option>
            <option value="365d">Ostatni rok</option>
            <option value="all">Cały okres</option>
          </select>
        </label>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">{error}</div>}
      {loading && <div className="text-center text-muted-foreground py-12">Ładowanie analityki…</div>}

      {data && !loading && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
            {[
              { label: 'Rezerwacje', value: data.summary.totalBookings, icon: CalendarCheck },
              { label: 'Ukończone', value: data.summary.completedBookings, icon: TrendingUp },
              { label: 'Anulowane', value: data.summary.cancelledBookings, icon: XCircle },
              {
                label: 'Przychód',
                value: money(data.summary.revenue, data.summary.currency),
                icon: CircleDollarSign,
              },
            ].map(metric => (
              <div key={metric.label} className="card p-6">
                <metric.icon className="w-7 h-7 text-accent mb-4" />
                <p className="text-sm text-muted-foreground">{metric.label}</p>
                <p className="text-3xl font-bold mt-1">{metric.value}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
            <div className="card p-6">
              <p className="text-sm text-muted-foreground">Skuteczność realizacji</p>
              <p className="text-2xl font-bold mt-2">{data.summary.completionRate}%</p>
            </div>
            <div className="card p-6">
              <p className="text-sm text-muted-foreground">Nadchodzące</p>
              <p className="text-2xl font-bold mt-2">{data.summary.upcomingBookings}</p>
            </div>
            <div className="card p-6">
              <p className="text-sm text-muted-foreground">Ocena</p>
              <p className="text-2xl font-bold mt-2 flex items-center gap-2">
                <Star className="w-5 h-5 fill-amber-400 text-amber-400" />
                {data.summary.averageRating ?? '—'}
                <span className="text-sm font-normal text-muted-foreground">
                  ({data.summary.reviewCount})
                </span>
              </p>
            </div>
          </div>

          <div className="card overflow-hidden">
            <div className="p-6 border-b">
              <h2 className="font-heading font-semibold text-xl">Ostatnie 6 miesięcy</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left">
                  <tr>
                    <th className="p-4">Miesiąc</th>
                    <th className="p-4">Rezerwacje</th>
                    <th className="p-4">Ukończone</th>
                    <th className="p-4">Przychód</th>
                  </tr>
                </thead>
                <tbody>
                  {data.months.map(month => (
                    <tr key={month.month} className="border-t">
                      <td className="p-4 font-medium">{month.month}</td>
                      <td className="p-4">{month.bookings}</td>
                      <td className="p-4">{month.completed}</td>
                      <td className="p-4">{money(month.revenue, data.summary.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
