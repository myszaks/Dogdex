import type {
  CompetitionExpression,
  CompetitionFormatDefinition,
} from '@/types/competition'

function humanizeIdentifier(value: string) {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/^\p{Ll}/u, letter => letter.toLocaleUpperCase('pl-PL'))
}

export function competitionFieldLabels(definition: CompetitionFormatDefinition) {
  return new Map([
    ...definition.eventFields.map(field => [`event.${field.id}`, field.label] as const),
    ...definition.resultFields.flatMap(field => [
      [`values.${field.id}`, field.label] as const,
      [`attempt.values.${field.id}`, field.label] as const,
      [`valid_attempts.values.${field.id}`, `${field.label} z poprawnych prób`] as const,
    ]),
    ...definition.computedFields.map(field => [`computed.${field.id}`, field.label] as const),
  ])
}

export function describeCompetitionReference(
  path: string,
  labels: ReadonlyMap<string, string>,
) {
  const directLabel = labels.get(path)
  if (directLabel) return `„${directLabel}”`

  const suffixMatch = [...labels.entries()].find(([candidate]) =>
    path.endsWith(`.${candidate}`)
  )
  if (suffixMatch) return `„${suffixMatch[1]}”`

  return `„${humanizeIdentifier(path.split('.').at(-1) ?? path)}”`
}

export function describeCompetitionExpression(
  expression: CompetitionExpression,
  labels: ReadonlyMap<string, string>,
): string {
  switch (expression.op) {
    case 'literal':
      if (expression.value === null) return 'brak wartości'
      if (typeof expression.value === 'boolean') return expression.value ? 'tak' : 'nie'
      return String(expression.value)
    case 'ref':
      return describeCompetitionReference(expression.path, labels)
    case 'coalesce':
      return `pierwsza dostępna wartość z: ${expression.args
        .map(item => describeCompetitionExpression(item, labels))
        .join(', ')}`
    case 'round':
      return `zaokrąglij ${describeCompetitionExpression(expression.value, labels)} do ${expression.precision ?? 0} miejsc`
    case 'not':
      return `nie (${describeCompetitionExpression(expression.value, labels)})`
    case 'if':
      return `jeżeli ${describeCompetitionExpression(expression.condition, labels)}, to ${describeCompetitionExpression(expression.then, labels)}, w przeciwnym razie ${describeCompetitionExpression(expression.else, labels)}`
    case 'eq':
    case 'neq':
    case 'lt':
    case 'lte':
    case 'gt':
    case 'gte': {
      const comparison: Record<typeof expression.op, string> = {
        eq: '=',
        neq: '≠',
        lt: '<',
        lte: '≤',
        gt: '>',
        gte: '≥',
      }
      return `${describeCompetitionExpression(expression.left, labels)} ${comparison[expression.op]} ${describeCompetitionExpression(expression.right, labels)}`
    }
    case 'add':
    case 'subtract':
    case 'multiply':
    case 'divide':
    case 'and':
    case 'or':
    case 'min':
    case 'max':
    case 'sum':
    case 'average': {
      const args = expression.args.map(item => describeCompetitionExpression(item, labels))
      if (expression.op === 'add') return args.join(' + ')
      if (expression.op === 'subtract') return args.join(' − ')
      if (expression.op === 'multiply') return args.join(' × ')
      if (expression.op === 'divide') return args.join(' ÷ ')
      if (expression.op === 'and') return args.join(' oraz ')
      if (expression.op === 'or') return args.join(' lub ')
      const operationLabel = {
        min: 'najniższa wartość',
        max: 'najwyższa wartość',
        sum: 'suma',
        average: 'średnia',
      }[expression.op]
      return `${operationLabel} z: ${args.join(', ')}`
    }
  }
}
