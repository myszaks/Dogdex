import {
  SPEEDWAY_FORMAT,
  TIME_TRIAL_FORMAT,
  VERSATILE_DOG_CUP_FORMAT,
} from '@/lib/competitionPresets'
import type { CompetitionFormatDefinition } from '@/types/competition'

export type CompetitionPresetKey = 'time_trial' | 'speedway' | 'points'

export interface CompetitionPresetOption {
  key: CompetitionPresetKey
  label: string
  description: string
  definition: CompetitionFormatDefinition
}

export const COMPETITION_PRESETS: CompetitionPresetOption[] = [
  {
    key: 'time_trial',
    label: 'Najlepszy czas',
    description: 'Kilka prób, wygrywa najlepszy czas.',
    definition: TIME_TRIAL_FORMAT,
  },
  {
    key: 'speedway',
    label: 'Speedway',
    description: 'Dwie próby i ranking w klasach wzrostowych.',
    definition: SPEEDWAY_FORMAT,
  },
  {
    key: 'points',
    label: 'Suma punktów',
    description: 'Konkurencje, wagi, bonusy i punkty karne.',
    definition: VERSATILE_DOG_CUP_FORMAT,
  },
]

const RECOMMENDED_PRESET_BY_EVENT_TYPE: Record<string, CompetitionPresetKey> = {
  agility: 'time_trial',
  canicross: 'time_trial',
  speedway: 'speedway',
  dog_show: 'points',
  flyball: 'points',
  fullfocus: 'points',
  obedience: 'points',
  rally_o: 'points',
}

export function getRecommendedCompetitionPreset(
  eventTypeId: string | null | undefined,
): CompetitionPresetOption | null {
  if (!eventTypeId) return null
  const key = RECOMMENDED_PRESET_BY_EVENT_TYPE[eventTypeId.toLowerCase()]
  return COMPETITION_PRESETS.find(preset => preset.key === key) ?? null
}

export function isLikelyNonCompetitiveEvent(
  eventTypeId: string | null | undefined,
): boolean {
  if (!eventTypeId) return false
  const normalized = eventTypeId.toLowerCase()
  return normalized === 'spacer' || normalized.includes('wyk')
}

export function cloneCompetitionPreset(
  key: CompetitionPresetKey,
): CompetitionFormatDefinition {
  const preset = COMPETITION_PRESETS.find(candidate => candidate.key === key)
  if (!preset) throw new Error(`Unknown competition preset: ${key}`)
  return structuredClone(preset.definition)
}
