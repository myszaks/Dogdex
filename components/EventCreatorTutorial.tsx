'use client'

import { useEffect, useState } from 'react'
import {
  Check,
  ChevronLeft,
  ChevronRight,
  FileText,
  Library,
  Sparkles,
  Trophy,
  X,
} from 'lucide-react'
import useUser from '@/hooks/useUser'
import { cn } from '@/lib/utils'

const TUTORIAL_STEPS = [
  {
    Icon: FileText,
    title: 'Jedno wydarzenie, jeden prosty kreator',
    description: 'Uzupełnij informacje, termin i zapisy krok po kroku. Możesz wrócić do wcześniejszego kroku bez utraty wpisanych danych.',
  },
  {
    Icon: Trophy,
    title: 'Wyniki są całkowicie opcjonalne',
    description: 'Dla spaceru albo warsztatów zostaw je wyłączone. Dla zawodów włącz moduł, a kreator podpowie odpowiedni sposób liczenia.',
  },
  {
    Icon: Sparkles,
    title: 'Zacznij od podpowiedzi',
    description: 'Wybierz prosty wariant, gotowy schemat lub dopasuj obliczenia i widoki live. Nie musisz znać technicznego języka systemu.',
  },
  {
    Icon: Library,
    title: 'Twoje schematy należą do Ciebie',
    description: 'Zapisany schemat jest dostępny tylko na Twoim koncie. Użyjesz go ponownie przy kolejnym wydarzeniu.',
  },
]

export default function EventCreatorTutorial({
  manualOpen,
  onManualOpenChange,
}: {
  manualOpen: boolean
  onManualOpenChange: (open: boolean) => void
}) {
  const { user } = useUser()
  const [autoOpen, setAutoOpen] = useState(false)
  const [step, setStep] = useState(0)
  const [seen, setSeen] = useState(false)

  useEffect(() => {
    if (!user?.id) return
    let cancelled = false
    const localKey = `dogdex:event-creator-tutorial:${user.id}`
    const locallySeen = window.localStorage.getItem(localKey) === 'seen'

    fetch('/api/profile')
      .then(async response => {
        if (!response.ok) throw new Error('profile unavailable')
        return response.json()
      })
      .then(profile => {
        if (cancelled) return
        const alreadySeen = Boolean(profile.event_creator_tutorial_seen_at) || locallySeen
        setSeen(alreadySeen)
        if (!alreadySeen) {
          setStep(0)
          setAutoOpen(true)
        }
      })
      .catch(() => {
        if (cancelled) return
        setSeen(locallySeen)
        if (!locallySeen) {
          setStep(0)
          setAutoOpen(true)
        }
      })

    return () => {
      cancelled = true
    }
  }, [user?.id])

  function closeTutorial() {
    setAutoOpen(false)
    onManualOpenChange(false)
    setStep(0)
    if (!user?.id || seen) return
    setSeen(true)
    window.localStorage.setItem(`dogdex:event-creator-tutorial:${user.id}`, 'seen')
    void fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ event_creator_tutorial_seen: true }),
    })
  }

  if (!autoOpen && !manualOpen) return null

  const item = TUTORIAL_STEPS[step]
  const Icon = item.Icon
  const isLast = step === TUTORIAL_STEPS.length - 1

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/45 backdrop-blur-sm"
        onClick={closeTutorial}
        aria-label="Zamknij tutorial"
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="event-creator-tutorial-title"
        className="relative z-10 w-full max-w-xl overflow-hidden rounded-3xl border border-sage-200 bg-white shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-sage-200 px-6 py-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-accent">Szybki start</p>
            <p className="mt-0.5 text-sm text-muted-foreground">około 1 minuty</p>
          </div>
          <button
            type="button"
            onClick={closeTutorial}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-sage-100 text-sage-600 hover:bg-sage-200"
            aria-label="Zamknij tutorial"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-6 sm:p-8">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-100 text-accent">
            <Icon className="h-8 w-8" />
          </div>
          <h2 id="event-creator-tutorial-title" className="mt-6 text-2xl font-heading font-bold text-primary">
            {item.title}
          </h2>
          <p className="mt-3 min-h-20 text-base leading-7 text-muted-foreground">
            {item.description}
          </p>

          <div className="mt-6 flex gap-2">
            {TUTORIAL_STEPS.map((tutorialStep, index) => (
              <button
                key={tutorialStep.title}
                type="button"
                onClick={() => setStep(index)}
                className={cn(
                  'h-2 flex-1 rounded-full transition',
                  index === step ? 'bg-accent' : index < step ? 'bg-primary' : 'bg-sage-200',
                )}
                aria-label={`Przejdź do kroku ${index + 1}`}
              />
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-sage-200 bg-sage-50 px-6 py-4">
          <button
            type="button"
            onClick={() => setStep(current => Math.max(0, current - 1))}
            disabled={step === 0}
            className="btn btn-secondary disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" />
            Wstecz
          </button>
          <span className="text-xs font-semibold text-sage-500">{step + 1} / {TUTORIAL_STEPS.length}</span>
          <button
            type="button"
            onClick={() => isLast ? closeTutorial() : setStep(current => current + 1)}
            className="btn btn-primary"
          >
            {isLast ? (
              <>
                Zaczynam
                <Check className="h-4 w-4" />
              </>
            ) : (
              <>
                Dalej
                <ChevronRight className="h-4 w-4" />
              </>
            )}
          </button>
        </div>
      </section>
    </div>
  )
}
