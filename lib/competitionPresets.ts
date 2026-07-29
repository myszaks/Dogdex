import type { CompetitionFormatDefinition } from '@/types/competition'

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
      label: 'Widok live',
      kind: 'live',
      blocks: [
        { id: 'current', type: 'current_entry', title: 'Aktualnie na starcie' },
        { id: 'next', type: 'next_up', title: 'Przygotowują się', limit: 5 },
        {
          id: 'live_table',
          type: 'leaderboard',
          title: 'Wyniki live',
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
