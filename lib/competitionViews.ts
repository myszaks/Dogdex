import type {
  CompetitionFormatDefinition,
  CompetitionScalar,
  CompetitionViewBlockDefinition,
} from '@/types/competition'

export interface CompetitionResultViewRow {
  participant_id: string
  computed: Record<string, CompetitionScalar>
  groups: Record<string, string | null>
  ranks: Record<string, number | null>
}

export interface CompetitionResultViewGroup<Row extends CompetitionResultViewRow> {
  key: string
  title: string | null
  rows: Row[]
}

export function sortCompetitionResultsForBlock<Row extends CompetitionResultViewRow>(
  results: Row[],
  block: CompetitionViewBlockDefinition,
): Row[] {
  if (!block.rankingId) return results
  return [...results].sort((left, right) => {
    const leftRank = left.ranks[block.rankingId!] ?? Number.MAX_SAFE_INTEGER
    const rightRank = right.ranks[block.rankingId!] ?? Number.MAX_SAFE_INTEGER
    if (leftRank !== rightRank) return leftRank - rightRank
    return left.participant_id.localeCompare(right.participant_id)
  })
}

export function configuredCompetitionGroupValues(
  definition: CompetitionFormatDefinition['groups'][number] | undefined,
) {
  return [
    ...(definition?.values ?? definition?.buckets ?? []),
    ...(definition?.overrides ?? []).map(({ key, label }) => ({ key, label })),
  ]
}

export function competitionGroupValueLabel(
  definition: CompetitionFormatDefinition['groups'][number] | undefined,
  value: string | null,
) {
  if (value === null) return 'Bez grupy'
  return configuredCompetitionGroupValues(definition)
    .find(candidate => candidate.key === value)?.label ?? value
}

export function groupCompetitionResultsForBlock<Row extends CompetitionResultViewRow>(
  definition: CompetitionFormatDefinition,
  results: Row[],
  block: CompetitionViewBlockDefinition,
): CompetitionResultViewGroup<Row>[] {
  const ordered = sortCompetitionResultsForBlock(results, block)
  const ranking = definition.rankings.find(candidate => candidate.id === block.rankingId)
  if (!ranking || ranking.groupBy.length === 0) {
    return [{ key: '__all', title: null, rows: ordered }]
  }

  const groupsById = new Map(definition.groups.map(group => [group.id, group]))
  const grouped = new Map<string, CompetitionResultViewGroup<Row> & { values: Array<string | null> }>()

  for (const row of ordered) {
    const values = ranking.groupBy.map(groupId => row.groups[groupId] ?? null)
    const key = JSON.stringify(values)
    const current = grouped.get(key) ?? {
      key,
      title: ranking.groupBy.map((groupId, index) => {
        const groupDefinition = groupsById.get(groupId)
        return `${groupDefinition?.label ?? groupId}: ${competitionGroupValueLabel(groupDefinition, values[index])}`
      }).join(' · '),
      rows: [],
      values,
    }
    current.rows.push(row)
    grouped.set(key, current)
  }

  return [...grouped.values()]
    .sort((left, right) => {
      for (let index = 0; index < ranking.groupBy.length; index += 1) {
        const groupDefinition = groupsById.get(ranking.groupBy[index])
        const configuredValues = configuredCompetitionGroupValues(groupDefinition)
        const leftIndex = configuredValues.findIndex(value => value.key === left.values[index])
        const rightIndex = configuredValues.findIndex(value => value.key === right.values[index])
        const normalizedLeftIndex = leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex
        const normalizedRightIndex = rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex
        if (normalizedLeftIndex !== normalizedRightIndex) {
          return normalizedLeftIndex - normalizedRightIndex
        }
        const labelComparison = competitionGroupValueLabel(groupDefinition, left.values[index])
          .localeCompare(competitionGroupValueLabel(groupDefinition, right.values[index]), 'pl')
        if (labelComparison !== 0) return labelComparison
      }
      return left.key.localeCompare(right.key)
    })
    .map(group => ({
      key: group.key,
      title: group.title,
      rows: group.rows,
    }))
}
