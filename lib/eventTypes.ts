import type { FormField } from '@/types'

export interface EventType {
  id: string
  name: string
  icon: string
  defaultFields: FormField[]
}

export const EVENT_TYPES: EventType[] = [
  {
    id: 'agility',
    name: 'Agility',
    icon: '🏃',
    defaultFields: [
      {
        id: 'category',
        label: 'Kategoria startowa',
        type: 'select',
        required: true,
        options: ['A1', 'A2', 'A3', 'Open'],
      },
      {
        id: 'club',
        label: 'Klub / Szkoła',
        type: 'text',
        required: false,
        placeholder: 'Nazwa klubu',
      },
    ],
  },
  {
    id: 'flyball',
    name: 'Flyball',
    icon: '🎾',
    defaultFields: [
      {
        id: 'team',
        label: 'Nazwa drużyny',
        type: 'text',
        required: true,
        placeholder: 'np. Flying Dogs',
      },
      {
        id: 'division',
        label: 'Dywizja',
        type: 'select',
        required: false,
        options: ['DN1', 'DN2', 'OC', 'Veteran'],
      },
    ],
  },
  {
    id: 'dog_show',
    name: 'Wystawa psów',
    icon: '🏆',
    defaultFields: [
      {
        id: 'breed_class',
        label: 'Klasa wystawowa',
        type: 'select',
        required: true,
        options: [
          'Baby',
          'Szczenię',
          'Młodzież',
          'Pośrednia',
          'Otwarta',
          'Championów',
          'Robocza',
          'Weteranów',
        ],
      },
      {
        id: 'titles',
        label: 'Tytuły / Certyfikaty',
        type: 'text',
        required: false,
        placeholder: 'np. CH PL, J.CH PL',
      },
    ],
  },
  {
    id: 'obedience',
    name: 'Obedience',
    icon: '🎓',
    defaultFields: [
      {
        id: 'ob_class',
        label: 'Klasa OB',
        type: 'select',
        required: true,
        options: ['OB 0', 'OB 1', 'OB 2', 'OB 3'],
      },
    ],
  },
  {
    id: 'rally_o',
    name: 'Rally-O',
    icon: '📍',
    defaultFields: [
      {
        id: 'rally_class',
        label: 'Klasa Rally-O',
        type: 'select',
        required: true,
        options: ['Novice', 'Advanced', 'Excellent', 'Masters'],
      },
    ],
  },
  {
    id: 'canicross',
    name: 'Canicross / Bikejoring',
    icon: '🚴',
    defaultFields: [
      {
        id: 'discipline',
        label: 'Dyscyplina',
        type: 'select',
        required: true,
        options: ['Canicross', 'Bikejoring', 'Skijoring', 'Scooter'],
      },
      {
        id: 'age_category',
        label: 'Kategoria wiekowa',
        type: 'select',
        required: false,
        options: ['Junior', 'Senior', 'Master'],
      },
    ],
  },
  {
    id: 'speedway',
    name: 'Speedway / Wyścigi',
    icon: '🏎️',
    defaultFields: [
      {
        id: 'height_cm',
        label: 'Wzrost psa w kłębie (cm)',
        type: 'number',
        required: true,
        placeholder: 'np. 45',
        description: 'Klasa startowa zostanie przydzielona automatycznie: XS (<30cm), S (30–39.9cm), M (40–49.9cm), L (50–59.9cm), XL (≥60cm)',
      },
    ],
  },
  {
    id: 'spacer',
    name: 'Spacer / Marsz',
    icon: '🚶',
    defaultFields: [
      {
        id: 'walk_dates',
        label: 'Wybierz terminy spacerów',
        type: 'multidate',
        required: true,
        options: [],
        description: 'Zaznacz daty, które Ci odpowiadają.',
      },
      {
        id: 'dog_count',
        label: 'Liczba psów',
        type: 'number',
        required: false,
        placeholder: '1',
      },
    ],
  },
  {
    id: 'wykłady',
    name: 'Wykłady / Szkolenia',
    icon: '📚',
    defaultFields: [
      {
        id: 'experience_level',
        label: 'Poziom doświadczenia',
        type: 'select',
        required: true,
        options: ['Początkujący', 'Średniozaawansowany', 'Zaawansowany'],
      },
      {
        id: 'diet_requirements',
        label: 'Wymagania dietetyczne / alergie',
        type: 'text',
        required: false,
        placeholder: 'np. wegetariańskie, brak orzechów...',
      },
    ],
  },
  {
    id: 'other',
    name: 'Inne',
    icon: '🐕',
    defaultFields: [],
  },
]

export function getEventType(id: string | null | undefined): EventType | undefined {
  return EVENT_TYPES.find(t => t.id === id)
}
