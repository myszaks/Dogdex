import type { CompetitionFormatDefinition } from '@/types/competition'
import { buildWeightedScoreExpression } from '@/lib/competitionFormulaBuilder'

/**
 * A neutral time-trial preset used by the format creator and engine tests.
 * Event-specific values (for example distance_m) live on the event snapshot,
 * while this object describes the reusable mechanics and presentation.
 */
export const TIME_TRIAL_FORMAT: CompetitionFormatDefinition = {
  schemaVersion: 1,
  name: 'Próby czasowe — najlepszy wynik',
  eventFields: [
    {
      id: 'distance_m',
      label: 'Długość trasy',
      type: 'number',
      required: true,
      unit: 'm',
      min: 1,
      max: 50000,
      precision: 2,
    },
  ],
  resultFields: [
    {
      id: 'time_ms',
      label: 'Czas',
      type: 'duration_ms',
      required: true,
      unit: 'ms',
      min: 1,
    },
  ],
  stages: [
    {
      id: 'main',
      label: 'Próby',
      attempts: [
        { id: 'run_1', label: 'Próba 1' },
        { id: 'run_2', label: 'Próba 2' },
      ],
    },
  ],
  statuses: [
    { id: 'dns', label: 'DNS', kind: 'excluded' },
    { id: 'dnf', label: 'DNF', kind: 'excluded' },
    { id: 'dsq', label: 'DSQ', kind: 'excluded' },
  ],
  computedFields: [
    {
      id: 'best_time_ms',
      label: 'Najlepszy czas',
      type: 'duration_ms',
      expression: {
        op: 'min',
        args: [{ op: 'ref', path: 'valid_attempts.values.time_ms' }],
      },
      unit: 'ms',
    },
    {
      id: 'speed_kmh',
      label: 'Prędkość',
      type: 'number',
      expression: {
        op: 'round',
        precision: 2,
        value: {
          op: 'multiply',
          args: [
            {
              op: 'divide',
              args: [
                { op: 'ref', path: 'event.distance_m' },
                {
                  op: 'divide',
                  args: [
                    { op: 'ref', path: 'computed.best_time_ms' },
                    { op: 'literal', value: 1000 },
                  ],
                },
              ],
            },
            { op: 'literal', value: 3.6 },
          ],
        },
      },
      unit: 'km/h',
      precision: 2,
    },
  ],
  groups: [],
  rankings: [
    {
      id: 'overall',
      label: 'Klasyfikacja generalna',
      groupBy: [],
      eligibility: {
        op: 'gt',
        left: { op: 'ref', path: 'computed.best_time_ms' },
        right: { op: 'literal', value: 0 },
      },
      orderBy: [
        {
          expression: { op: 'ref', path: 'computed.best_time_ms' },
          direction: 'asc',
          nulls: 'last',
        },
      ],
      ties: 'competition',
    },
  ],
  views: [
    {
      id: 'live',
      label: 'Widok na żywo',
      kind: 'live',
      blocks: [
        { id: 'current', type: 'current_entry', title: 'Aktualnie na starcie' },
        { id: 'next', type: 'next_up', title: 'Przygotowują się', limit: 5 },
        {
          id: 'live_table',
          type: 'leaderboard',
          title: 'Wyniki na żywo',
          rankingId: 'overall',
          fields: ['computed.best_time_ms', 'computed.speed_kmh'],
        },
      ],
    },
    {
      id: 'results',
      label: 'Wyniki końcowe',
      kind: 'results',
      blocks: [
        {
          id: 'podium',
          type: 'podium',
          title: 'Podium',
          rankingId: 'overall',
          limit: 3,
        },
        {
          id: 'results_table',
          type: 'result_table',
          title: 'Pełne wyniki',
          rankingId: 'overall',
          fields: ['computed.best_time_ms', 'computed.speed_kmh'],
        },
      ],
    },
  ],
}

/**
 * Reference configuration mirroring the current Dogdex Speedway rules.
 * The application adapter exposes the dog's height as registration.dog_height_cm.
 * Height buckets live in the format itself, so every organizer can adjust the
 * class boundaries without changing backend code.
 */
export const SPEEDWAY_FORMAT: CompetitionFormatDefinition = {
  schemaVersion: 1,
  name: 'Speedway — dwie próby w klasach wzrostowych',
  eventFields: [
    {
      id: 'distance_m',
      label: 'Długość toru',
      type: 'number',
      required: true,
      unit: 'm',
      min: 1,
      max: 500,
      precision: 2,
    },
  ],
  resultFields: [
    {
      id: 'time_ms',
      label: 'Czas',
      type: 'duration_ms',
      required: true,
      unit: 'ms',
      min: 1,
    },
  ],
  stages: [
    {
      id: 'main',
      label: 'Przejazdy',
      attempts: [
        { id: 'run_1', label: 'Próba 1' },
        { id: 'run_2', label: 'Próba 2' },
      ],
    },
  ],
  statuses: [
    { id: 'dns', label: 'DNS', kind: 'excluded' },
    { id: 'dnf', label: 'DNF', kind: 'excluded' },
  ],
  computedFields: [
    {
      id: 'best_time_ms',
      label: 'Najlepszy czas',
      type: 'duration_ms',
      expression: {
        op: 'min',
        args: [{ op: 'ref', path: 'valid_attempts.values.time_ms' }],
      },
      unit: 'ms',
      precision: 2,
    },
    {
      id: 'speed_kmh',
      label: 'Prędkość',
      type: 'number',
      expression: {
        op: 'round',
        precision: 2,
        value: {
          op: 'multiply',
          args: [
            {
              op: 'divide',
              args: [
                { op: 'ref', path: 'event.distance_m' },
                {
                  op: 'divide',
                  args: [
                    { op: 'ref', path: 'computed.best_time_ms' },
                    { op: 'literal', value: 1000 },
                  ],
                },
              ],
            },
            { op: 'literal', value: 3.6 },
          ],
        },
      },
      unit: 'km/h',
      precision: 2,
    },
  ],
  groups: [
    {
      id: 'size_class',
      label: 'Klasa wzrostowa',
      source: { op: 'ref', path: 'registration.dog_height_cm' },
      overrides: [
        {
          key: 'sport',
          label: 'Sport',
          when: { op: 'ref', path: 'registration.speedway_sport' },
        },
        {
          key: 'sighthounds',
          label: 'Charty',
          when: { op: 'ref', path: 'registration.speedway_sighthound' },
        },
      ],
      buckets: [
        { key: 'xs', label: 'XS', max: 30 },
        { key: 's', label: 'S', min: 30, max: 40 },
        { key: 'm', label: 'M', min: 40, max: 50 },
        { key: 'l', label: 'L', min: 50 },
      ],
    },
  ],
  rankings: [
    {
      id: 'class',
      label: 'Klasyfikacja w klasie',
      groupBy: ['size_class'],
      eligibility: {
        op: 'and',
        args: [
          {
            op: 'eq',
            left: { op: 'ref', path: 'registration.checked_in' },
            right: { op: 'literal', value: true },
          },
          {
            op: 'gt',
            left: { op: 'ref', path: 'computed.best_time_ms' },
            right: { op: 'literal', value: 0 },
          },
        ],
      },
      orderBy: [
        {
          expression: { op: 'ref', path: 'computed.best_time_ms' },
          direction: 'asc',
          nulls: 'last',
        },
      ],
      ties: 'competition',
    },
  ],
  views: [
    {
      id: 'live',
      label: 'Speedway na żywo',
      kind: 'live',
      blocks: [
        { id: 'current', type: 'current_entry', title: 'Aktualnie na starcie' },
        { id: 'next', type: 'next_up', title: 'Przygotowują się', limit: 5 },
        { id: 'progress', type: 'progress', title: 'Postęp zawodów' },
        {
          id: 'live_table',
          type: 'leaderboard',
          title: 'Wyniki na żywo',
          rankingId: 'class',
          fields: ['computed.best_time_ms', 'computed.speed_kmh'],
        },
      ],
    },
    {
      id: 'results',
      label: 'Wyniki Speedway',
      kind: 'results',
      blocks: [
        {
          id: 'podium',
          type: 'podium',
          title: 'Podium',
          rankingId: 'class',
          limit: 3,
        },
        {
          id: 'results_table',
          type: 'result_table',
          title: 'Pełne wyniki',
          rankingId: 'class',
          fields: ['computed.best_time_ms', 'computed.speed_kmh'],
        },
      ],
    },
  ],
}

/**
 * A deliberately more advanced preset used to exercise the organizer-facing
 * builder: weighted disciplines, bonuses, penalties, qualification threshold,
 * and deterministic tie-breakers.
 */
export const VERSATILE_DOG_CUP_FORMAT: CompetitionFormatDefinition = {
  schemaVersion: 1,
  name: 'Puchar wszechstronnego psa',
  eventFields: [],
  resultFields: [
    {
      id: 'agility_points',
      label: 'Agility',
      type: 'number',
      required: true,
      unit: 'pkt',
      min: 0,
      max: 100,
      precision: 1,
    },
    {
      id: 'obedience_points',
      label: 'Posłuszeństwo',
      type: 'number',
      required: true,
      unit: 'pkt',
      min: 0,
      max: 100,
      precision: 1,
    },
    {
      id: 'nosework_points',
      label: 'Nosework',
      type: 'number',
      required: true,
      unit: 'pkt',
      min: 0,
      max: 100,
      precision: 1,
    },
    {
      id: 'teamwork_bonus',
      label: 'Bonus za współpracę',
      type: 'number',
      required: true,
      unit: 'pkt',
      min: 0,
      max: 10,
      precision: 1,
    },
    {
      id: 'penalty_points',
      label: 'Punkty karne',
      type: 'number',
      required: true,
      unit: 'pkt',
      min: 0,
      max: 50,
      precision: 1,
    },
  ],
  stages: [
    {
      id: 'main',
      label: 'Ocena konkurencji',
      attempts: [{ id: 'scorecard', label: 'Karta punktowa' }],
    },
  ],
  statuses: [
    { id: 'dns', label: 'DNS', kind: 'excluded' },
    { id: 'dnf', label: 'DNF', kind: 'excluded' },
    { id: 'dsq', label: 'Dyskwalifikacja', kind: 'excluded' },
  ],
  computedFields: [
    {
      id: 'agility_score',
      label: 'Wynik Agility',
      type: 'number',
      expression: {
        op: 'sum',
        args: [{ op: 'ref', path: 'valid_attempts.values.agility_points' }],
      },
      unit: 'pkt',
      precision: 1,
    },
    {
      id: 'obedience_score',
      label: 'Wynik posłuszeństwa',
      type: 'number',
      expression: {
        op: 'sum',
        args: [{ op: 'ref', path: 'valid_attempts.values.obedience_points' }],
      },
      unit: 'pkt',
      precision: 1,
    },
    {
      id: 'penalty_score',
      label: 'Suma kar',
      type: 'number',
      expression: {
        op: 'sum',
        args: [{ op: 'ref', path: 'valid_attempts.values.penalty_points' }],
      },
      unit: 'pkt',
      precision: 1,
    },
    {
      id: 'total_points',
      label: 'Punkty końcowe',
      type: 'number',
      expression: buildWeightedScoreExpression({
        precision: 1,
        terms: [
          { fieldId: 'agility_points', aggregation: 'sum', operation: 'add', multiplier: 0.4 },
          { fieldId: 'obedience_points', aggregation: 'sum', operation: 'add', multiplier: 0.3 },
          { fieldId: 'nosework_points', aggregation: 'sum', operation: 'add', multiplier: 0.2 },
          { fieldId: 'teamwork_bonus', aggregation: 'sum', operation: 'add', multiplier: 1 },
          { fieldId: 'penalty_points', aggregation: 'sum', operation: 'subtract', multiplier: 1 },
        ],
      }),
      unit: 'pkt',
      precision: 1,
    },
  ],
  groups: [],
  rankings: [
    {
      id: 'overall',
      label: 'Klasyfikacja generalna',
      groupBy: [],
      eligibility: {
        op: 'gte',
        left: { op: 'ref', path: 'computed.total_points' },
        right: { op: 'literal', value: 50 },
      },
      orderBy: [
        {
          expression: { op: 'ref', path: 'computed.total_points' },
          direction: 'desc',
          nulls: 'last',
        },
        {
          expression: { op: 'ref', path: 'computed.obedience_score' },
          direction: 'desc',
          nulls: 'last',
        },
        {
          expression: { op: 'ref', path: 'computed.penalty_score' },
          direction: 'asc',
          nulls: 'last',
        },
      ],
      ties: 'competition',
    },
  ],
  views: [
    {
      id: 'live',
      label: 'Puchar na żywo',
      kind: 'live',
      blocks: [
        { id: 'current', type: 'current_entry', title: 'Aktualnie oceniany zespół' },
        { id: 'progress', type: 'progress', title: 'Postęp oceniania' },
        {
          id: 'leaderboard',
          type: 'leaderboard',
          title: 'Klasyfikacja na żywo',
          rankingId: 'overall',
          fields: [
            'computed.total_points',
            'computed.agility_score',
            'computed.obedience_score',
            'computed.penalty_score',
          ],
        },
      ],
    },
    {
      id: 'results',
      label: 'Wyniki Pucharu',
      kind: 'results',
      blocks: [
        {
          id: 'podium',
          type: 'podium',
          title: 'Podium',
          rankingId: 'overall',
          limit: 3,
        },
        {
          id: 'results_table',
          type: 'result_table',
          title: 'Pełna klasyfikacja',
          rankingId: 'overall',
          fields: [
            'computed.total_points',
            'computed.agility_score',
            'computed.obedience_score',
            'computed.penalty_score',
          ],
        },
      ],
    },
  ],
}
