'use client'

import { useEffect, useMemo, useState } from 'react'
import { Check, ChevronLeft, ChevronRight, Lightbulb, X } from 'lucide-react'
import useUser from '@/hooks/useUser'

interface TutorialPrompt {
  id: string
  target: string
  title: string
  description: string
}

interface TargetRect {
  top: number
  left: number
  width: number
  height: number
  borderRadius: string
}

const PROMPTS_BY_STEP: Record<number, TutorialPrompt[]> = {
  0: [
    {
      id: 'event-cover',
      target: 'event-cover',
      title: 'Zdjęcie wydarzenia',
      description: 'To zdjęcie będzie widoczne na liście wydarzeń. Możesz je pominąć i wrócić do niego później.',
    },
    {
      id: 'event-details',
      target: 'event-details',
      title: 'Najważniejsze informacje',
      description: 'Na początek wystarczy nazwa. Opis i galerię możesz uzupełnić dopiero przed publikacją.',
    },
    {
      id: 'event-type',
      target: 'event-type',
      title: 'Typ wydarzenia',
      description: 'Ten wybór podpowiada odpowiedni formularz zapisów i — jeśli będzie potrzebny — schemat wyników.',
    },
  ],
  1: [
    {
      id: 'event-location',
      target: 'event-location',
      title: 'Miejsce wydarzenia',
      description: 'Wpisz nazwę obiektu i wyszukaj adres. Pin na mapie możesz później poprawić ręcznie.',
    },
    {
      id: 'event-dates',
      target: 'event-dates',
      title: 'Data i czas',
      description: 'Wymagana jest tylko data rozpoczęcia. Data zakończenia przydaje się przy wydarzeniach wielodniowych.',
    },
  ],
  2: [
    {
      id: 'registration-limits',
      target: 'registration-limits',
      title: 'Limit uczestników',
      description: 'Zostaw puste, jeśli nie chcesz ograniczać liczby zapisów.',
    },
    {
      id: 'registration-dates',
      target: 'registration-dates',
      title: 'Termin zapisów',
      description: 'Po tym terminie system sam zamknie rejestrację. To pole jest opcjonalne.',
    },
    {
      id: 'registration-fees',
      target: 'registration-fees',
      title: 'Opłaty',
      description: 'Włącz wpisowe tylko wtedy, gdy wydarzenie jest płatne. Bezpłatne wydarzenie nie wymaga żadnej konfiguracji.',
    },
    {
      id: 'registration-automation',
      target: 'registration-automation',
      title: 'Automatyzacja',
      description: 'Tutaj decydujesz, czy zgłoszenia mają być potwierdzane automatycznie i czy potrzebujesz grafiku startów.',
    },
    {
      id: 'registration-form',
      target: 'registration-form',
      title: 'Formularz zapisów',
      description: 'Wybierz gotowy szablon lub dodaj własne pytania. Każdy organizator ma własne szablony formularzy.',
    },
  ],
  3: [
    {
      id: 'results-toggle',
      target: 'results-toggle',
      title: 'Wyniki są opcjonalne',
      description: 'Dla spaceru lub warsztatów zostaw moduł wyłączony. Włącz go tylko dla zawodów, ocen lub klasyfikacji.',
    },
    {
      id: 'results-method',
      target: 'results-method',
      title: 'Sposób liczenia',
      description: 'Możesz zacząć od prostej propozycji, własnego schematu albo dostosować obliczenia bez opuszczania wydarzenia.',
    },
    {
      id: 'results-visibility',
      target: 'results-visibility',
      title: 'Widoczność live',
      description: 'Wyniki mogą być publiczne od razu albo pozostać prywatne do chwili, gdy zdecydujesz się je opublikować.',
    },
  ],
  4: [
    {
      id: 'event-preview',
      target: 'event-preview',
      title: 'Podgląd wydarzenia',
      description: 'Sprawdź, jak wydarzenie zobaczą uczestnicy i czy wszystkie ustawienia wyglądają poprawnie.',
    },
    {
      id: 'event-publish',
      target: 'event-publish',
      title: 'Szkic albo publikacja',
      description: 'Szkic jest widoczny tylko dla Ciebie. Publikacja uruchamia publiczną stronę wydarzenia i zapisy.',
    },
  ],
}

const STEP_LABELS = [
  'Informacje',
  'Lokalizacja i czas',
  'Rejestracja',
  'Wyniki i live',
  'Podgląd',
]

export default function EventCreatorTutorial({
  currentStep,
  forceStart,
  onManualComplete,
}: {
  currentStep: number
  forceStart: boolean
  onManualComplete: () => void
}) {
  const { user } = useUser()
  const prompts = useMemo(() => PROMPTS_BY_STEP[currentStep] ?? [], [currentStep])
  const [active, setActive] = useState(forceStart)
  const [promptIndex, setPromptIndex] = useState(0)
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null)

  const prompt = prompts[promptIndex]

  useEffect(() => {
    if (forceStart || !user?.id || prompts.length === 0) return
    let cancelled = false
    const completedKey = `dogdex:event-creator-tutorial:${user.id}`
    const locallyCompleted = window.localStorage.getItem(completedKey) === 'seen'

    if (locallyCompleted) return

    fetch('/api/profile')
      .then(async response => {
        if (!response.ok) throw new Error('profile unavailable')
        return response.json()
      })
      .then(profile => {
        if (cancelled || profile.event_creator_tutorial_seen_at) return
        const nextIndex = firstAvailablePromptIndex(prompts, readSeenPromptIds(user.id))
        if (nextIndex >= 0) {
          setPromptIndex(nextIndex)
          setActive(true)
        }
      })
      .catch(() => {
        if (cancelled) return
        const nextIndex = firstAvailablePromptIndex(prompts, readSeenPromptIds(user.id))
        if (nextIndex >= 0) {
          setPromptIndex(nextIndex)
          setActive(true)
        }
      })

    return () => {
      cancelled = true
    }
  }, [forceStart, prompts, user?.id])

  useEffect(() => {
    if (!active || !prompt) return
    const target = document.querySelector<HTMLElement>(
      `[data-tutorial-id="${prompt.target}"]`,
    )
    if (!target) return
    const targetElement = target

    const isSmallScreen = window.innerWidth < 640
    targetElement.scrollIntoView({
      behavior: 'auto',
      block: isSmallScreen ? 'start' : 'center',
    })
    if (isSmallScreen) {
      window.scrollBy({ top: -84, behavior: 'auto' })
    }

    function updatePosition() {
      const rect = targetElement.getBoundingClientRect()
      setTargetRect({
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
        borderRadius: window.getComputedStyle(targetElement).borderRadius,
      })
    }

    const frame = window.requestAnimationFrame(updatePosition)
    const observer = new ResizeObserver(updatePosition)
    observer.observe(targetElement)
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    window.visualViewport?.addEventListener('resize', updatePosition)
    window.visualViewport?.addEventListener('scroll', updatePosition)
    return () => {
      window.cancelAnimationFrame(frame)
      observer.disconnect()
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
      window.visualViewport?.removeEventListener('resize', updatePosition)
      window.visualViewport?.removeEventListener('scroll', updatePosition)
    }
  }, [active, prompt])

  if (!active || !prompt || !targetRect) return null

  const isLastPrompt = promptIndex === prompts.length - 1
  const isFinalStep = currentStep === 4
  const spotlightLeft = Math.max(8, targetRect.left - 5)
  const spotlightWidth = Math.min(
    targetRect.width + 10,
    window.innerWidth - spotlightLeft - 8,
  )

  function rememberPromptIds(ids: string[]) {
    if (!user?.id || forceStart) return
    const seen = readSeenPromptIds(user.id)
    ids.forEach(id => seen.add(id))
    window.localStorage.setItem(
      progressStorageKey(user.id),
      JSON.stringify([...seen]),
    )
  }

  function closeCurrentStep() {
    if (currentStep === 4 && !forceStart) {
      finishTutorial()
      return
    }
    rememberPromptIds(prompts.map(item => item.id))
    setActive(false)
    setTargetRect(null)
    if (forceStart) onManualComplete()
  }

  function nextPrompt() {
    rememberPromptIds([prompt.id])
    const nextIndex = firstAvailablePromptIndex(
      prompts,
      new Set(prompts.slice(0, promptIndex + 1).map(item => item.id)),
      promptIndex + 1,
    )
    if (nextIndex >= 0) {
      setTargetRect(null)
      setPromptIndex(nextIndex)
      return
    }
    if (isFinalStep) {
      finishTutorial()
      return
    }
    closeCurrentStep()
  }

  function previousPrompt() {
    for (let index = promptIndex - 1; index >= 0; index -= 1) {
      if (document.querySelector(`[data-tutorial-id="${prompts[index].target}"]`)) {
        setTargetRect(null)
        setPromptIndex(index)
        return
      }
    }
  }

  function finishTutorial() {
    setActive(false)
    setTargetRect(null)
    if (forceStart) {
      onManualComplete()
      return
    }
    if (!user?.id) return
    window.localStorage.setItem(`dogdex:event-creator-tutorial:${user.id}`, 'seen')
    window.localStorage.removeItem(progressStorageKey(user.id))
    void fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ event_creator_tutorial_seen: true }),
    })
  }

  return (
    <>
      <div
        className="pointer-events-none fixed z-[125] border-2 border-accent"
        style={{
          top: Math.max(6, targetRect.top - 5),
          left: spotlightLeft,
          width: spotlightWidth,
          height: Math.max(
            0,
            Math.min(
              targetRect.height + 10,
              window.innerHeight - Math.max(6, targetRect.top - 5) - 6,
            ),
          ),
          borderRadius: targetRect.borderRadius || '24px',
          boxShadow: '0 0 0 9999px rgba(16, 35, 31, 0.58), 0 12px 40px rgba(0, 0, 0, 0.24)',
        }}
      />

      <section
        role="dialog"
        aria-live="polite"
        aria-labelledby="event-creator-prompt-title"
        className="fixed bottom-3 left-3 right-3 z-[130] overflow-hidden rounded-2xl border border-orange-200 bg-white shadow-2xl sm:bottom-6 sm:left-auto sm:right-6 sm:w-[380px]"
      >
        <div className="flex items-center justify-between border-b border-sage-100 px-5 py-3">
          <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-accent">
            <Lightbulb className="h-4 w-4" />
            Krok {currentStep + 1}: {STEP_LABELS[currentStep]}
          </span>
          <button
            type="button"
            onClick={closeCurrentStep}
            className="flex min-h-8 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-sage-500 hover:bg-sage-100"
            aria-label="Pomiń podpowiedzi na tym kroku"
          >
            <X className="h-4 w-4" />
            Pomiń krok
          </button>
        </div>

        <div className="p-5">
          <h2 id="event-creator-prompt-title" className="font-heading text-xl font-bold text-primary">
            {prompt.title}
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{prompt.description}</p>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-sage-100 bg-sage-50 px-5 py-3">
          <button
            type="button"
            onClick={finishTutorial}
            className="text-xs font-semibold text-sage-500 hover:text-primary"
          >
            Wyłącz tutorial
          </button>
          <div className="flex gap-2">
            {promptIndex > 0 && (
              <button
                type="button"
                onClick={previousPrompt}
                className="btn btn-secondary btn-sm"
                aria-label="Poprzednia podpowiedź"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            )}
            <button type="button" onClick={nextPrompt} className="btn btn-primary btn-sm">
              {isLastPrompt && isFinalStep ? (
                <>
                  Gotowe
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
        </div>
      </section>
    </>
  )
}

function progressStorageKey(userId: string) {
  return `dogdex:event-creator-tutorial-progress:${userId}`
}

function readSeenPromptIds(userId: string): Set<string> {
  try {
    const stored = window.localStorage.getItem(progressStorageKey(userId))
    const parsed = stored ? JSON.parse(stored) : []
    return new Set(Array.isArray(parsed) ? parsed.filter(item => typeof item === 'string') : [])
  } catch {
    return new Set()
  }
}

function firstAvailablePromptIndex(
  prompts: TutorialPrompt[],
  seenIds: Set<string>,
  fromIndex = 0,
) {
  return prompts.findIndex((prompt, index) =>
    index >= fromIndex
    && !seenIds.has(prompt.id)
    && document.querySelector(`[data-tutorial-id="${prompt.target}"]`)
  )
}
