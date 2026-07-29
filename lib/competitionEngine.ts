import type {
  CompetitionCalculatedRow,
  CompetitionEntrantInput,
  CompetitionExpression,
  CompetitionFormatDefinition,
  CompetitionScalar,
} from '@/types/competition'

const MAX_EXPRESSION_DEPTH = 20
const MAX_EXPRESSION_NODES = 200
const IDENTIFIER_PATTERN = /^[a-z][a-z0-9_]{0,63}$/
const REFERENCE_PATTERN = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)*$/

type EvaluationValue = CompetitionScalar | EvaluationValue[]

export interface CompetitionFormatValidationIssue {
  path: string
  message: string
}

export type CompetitionFormatValidationResult =
  | { success: true; data: CompetitionFormatDefinition }
  | { success: false; issues: CompetitionFormatValidationIssue[] }

export function validateCompetitionFieldValues(
  fields: CompetitionFormatDefinition['eventFields'] | CompetitionFormatDefinition['resultFields'],
  value: unknown,
  options: { requireRequired?: boolean } = {},
): CompetitionFormatValidationIssue[] {
  const issues: CompetitionFormatValidationIssue[] = []
  if (!isRecord(value)) {
    return [{ path: '$', message: 'Wartości muszą być obiektem.' }]
  }

  const allowedIds = new Set(fields.map(field => field.id))
  for (const key of Object.keys(value)) {
    if (!allowedIds.has(key)) {
      issues.push({ path: key, message: 'Pole nie występuje w definicji formatu.' })
    }
  }

  for (const field of fields) {
    const fieldValue = value[field.id]
    if (fieldValue === undefined || fieldValue === null || fieldValue === '') {
      if (options.requireRequired !== false && field.required) {
        issues.push({ path: field.id, message: 'Pole jest wymagane.' })
      }
      continue
    }
    if (
      (field.type === 'number' || field.type === 'duration_ms')
      && (typeof fieldValue !== 'number' || !Number.isFinite(fieldValue))
    ) {
      issues.push({ path: field.id, message: 'Wartość musi być skończoną liczbą.' })
      continue
    }
    if (field.type === 'duration_ms' && (!Number.isInteger(fieldValue) || (fieldValue as number) <= 0)) {
      issues.push({ path: field.id, message: 'Czas musi być dodatnią liczbą całkowitą milisekund.' })
      continue
    }
    if (field.type === 'text' && typeof fieldValue !== 'string') {
      issues.push({ path: field.id, message: 'Wartość musi być tekstem.' })
      continue
    }
    if (field.type === 'boolean' && typeof fieldValue !== 'boolean') {
      issues.push({ path: field.id, message: 'Wartość musi być typu tak/nie.' })
      continue
    }
    if (typeof fieldValue === 'number') {
      if (field.min !== undefined && fieldValue < field.min) {
        issues.push({ path: field.id, message: `Wartość nie może być mniejsza niż ${field.min}.` })
      }
      if (field.max !== undefined && fieldValue > field.max) {
        issues.push({ path: field.id, message: `Wartość nie może być większa niż ${field.max}.` })
      }
    }
  }

  return issues
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isScalar(value: unknown): value is CompetitionScalar {
  return value === null
    || typeof value === 'string'
    || (typeof value === 'number' && Number.isFinite(value))
    || typeof value === 'boolean'
}

function validateIdentifier(
  value: unknown,
  path: string,
  issues: CompetitionFormatValidationIssue[],
) {
  if (typeof value !== 'string' || !IDENTIFIER_PATTERN.test(value)) {
    issues.push({
      path,
      message: 'Identyfikator musi zaczynać się literą i zawierać tylko małe litery, cyfry lub _.',
    })
  }
}

function validateUniqueIdentifiers(
  values: unknown[],
  path: string,
  issues: CompetitionFormatValidationIssue[],
) {
  const seen = new Set<string>()
  values.forEach((value, index) => {
    if (!isRecord(value)) {
      issues.push({ path: `${path}[${index}]`, message: 'Element musi być obiektem.' })
      return
    }
    validateIdentifier(value.id, `${path}[${index}].id`, issues)
    if (typeof value.id === 'string') {
      if (seen.has(value.id)) {
        issues.push({ path: `${path}[${index}].id`, message: 'Identyfikator musi być unikalny.' })
      }
      seen.add(value.id)
    }
  })
}

function validateExpression(
  value: unknown,
  path: string,
  issues: CompetitionFormatValidationIssue[],
  state: { nodes: number },
  depth = 0,
) {
  state.nodes += 1
  if (depth > MAX_EXPRESSION_DEPTH) {
    issues.push({ path, message: `Formuła przekracza maksymalną głębokość ${MAX_EXPRESSION_DEPTH}.` })
    return
  }
  if (state.nodes > MAX_EXPRESSION_NODES) {
    issues.push({ path, message: `Formuła przekracza limit ${MAX_EXPRESSION_NODES} elementów.` })
    return
  }
  if (!isRecord(value) || typeof value.op !== 'string') {
    issues.push({ path, message: 'Nieprawidłowy element formuły.' })
    return
  }

  switch (value.op) {
    case 'literal':
      if (!isScalar(value.value)) {
        issues.push({ path: `${path}.value`, message: 'Literał musi być liczbą, tekstem, booleanem lub null.' })
      }
      return
    case 'ref':
      if (typeof value.path !== 'string' || !REFERENCE_PATTERN.test(value.path)) {
        issues.push({ path: `${path}.path`, message: 'Nieprawidłowa ścieżka referencji.' })
      }
      return
    case 'add':
    case 'subtract':
    case 'multiply':
    case 'divide':
    case 'min':
    case 'max':
    case 'sum':
    case 'average':
    case 'coalesce':
    case 'and':
    case 'or': {
      if (!Array.isArray(value.args) || value.args.length === 0) {
        issues.push({ path: `${path}.args`, message: 'Operator wymaga co najmniej jednego argumentu.' })
        return
      }
      value.args.forEach((argument, index) =>
        validateExpression(argument, `${path}.args[${index}]`, issues, state, depth + 1)
      )
      return
    }
    case 'round':
    case 'not':
      validateExpression(value.value, `${path}.value`, issues, state, depth + 1)
      if (
        value.op === 'round'
        && value.precision !== undefined
        && (!Number.isInteger(value.precision) || (value.precision as number) < 0 || (value.precision as number) > 8)
      ) {
        issues.push({ path: `${path}.precision`, message: 'Precyzja musi być liczbą całkowitą od 0 do 8.' })
      }
      return
    case 'eq':
    case 'neq':
    case 'lt':
    case 'lte':
    case 'gt':
    case 'gte':
      validateExpression(value.left, `${path}.left`, issues, state, depth + 1)
      validateExpression(value.right, `${path}.right`, issues, state, depth + 1)
      return
    case 'if':
      validateExpression(value.condition, `${path}.condition`, issues, state, depth + 1)
      validateExpression(value.then, `${path}.then`, issues, state, depth + 1)
      validateExpression(value.else, `${path}.else`, issues, state, depth + 1)
      return
    default:
      issues.push({ path: `${path}.op`, message: `Nieobsługiwany operator: ${value.op}.` })
  }
}

function collectExpressionReferences(
  expression: CompetitionExpression,
  references: string[] = [],
): string[] {
  switch (expression.op) {
    case 'ref':
      references.push(expression.path)
      break
    case 'add':
    case 'subtract':
    case 'multiply':
    case 'divide':
    case 'min':
    case 'max':
    case 'sum':
    case 'average':
    case 'coalesce':
    case 'and':
    case 'or':
      expression.args.forEach(argument => collectExpressionReferences(argument, references))
      break
    case 'round':
    case 'not':
      collectExpressionReferences(expression.value, references)
      break
    case 'eq':
    case 'neq':
    case 'lt':
    case 'lte':
    case 'gt':
    case 'gte':
      collectExpressionReferences(expression.left, references)
      collectExpressionReferences(expression.right, references)
      break
    case 'if':
      collectExpressionReferences(expression.condition, references)
      collectExpressionReferences(expression.then, references)
      collectExpressionReferences(expression.else, references)
      break
    case 'literal':
      break
  }
  return references
}

function validateLabel(value: unknown, path: string, issues: CompetitionFormatValidationIssue[]) {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > 120) {
    issues.push({ path, message: 'Nazwa jest wymagana i może mieć maksymalnie 120 znaków.' })
  }
}

export function validateCompetitionFormatDefinition(
  value: unknown,
): CompetitionFormatValidationResult {
  const issues: CompetitionFormatValidationIssue[] = []
  if (!isRecord(value)) {
    return { success: false, issues: [{ path: '$', message: 'Definicja musi być obiektem.' }] }
  }

  if (value.schemaVersion !== 1) {
    issues.push({ path: 'schemaVersion', message: 'Obsługiwana jest wersja schematu 1.' })
  }
  validateLabel(value.name, 'name', issues)

  const collectionNames = [
    'eventFields',
    'resultFields',
    'stages',
    'statuses',
    'computedFields',
    'groups',
    'rankings',
    'views',
  ] as const
  const collectionLimits: Record<(typeof collectionNames)[number], number> = {
    eventFields: 50,
    resultFields: 50,
    stages: 20,
    statuses: 20,
    computedFields: 50,
    groups: 20,
    rankings: 10,
    views: 10,
  }

  for (const collectionName of collectionNames) {
    const collection = value[collectionName]
    if (!Array.isArray(collection)) {
      issues.push({ path: collectionName, message: 'Wartość musi być tablicą.' })
      continue
    }
    if (collection.length > collectionLimits[collectionName]) {
      issues.push({
        path: collectionName,
        message: `Kolekcja przekracza limit ${collectionLimits[collectionName]} elementów.`,
      })
    }
    validateUniqueIdentifiers(collection, collectionName, issues)
  }

  const fieldCollections = ['eventFields', 'resultFields'] as const
  for (const collectionName of fieldCollections) {
    const collection = Array.isArray(value[collectionName]) ? value[collectionName] : []
    collection.forEach((field, index) => {
      if (!isRecord(field)) return
      validateLabel(field.label, `${collectionName}[${index}].label`, issues)
      if (!['number', 'duration_ms', 'text', 'boolean'].includes(String(field.type))) {
        issues.push({ path: `${collectionName}[${index}].type`, message: 'Nieobsługiwany typ pola.' })
      }
      if (typeof field.min === 'number' && typeof field.max === 'number' && field.min > field.max) {
        issues.push({ path: `${collectionName}[${index}]`, message: 'Minimum nie może być większe od maksimum.' })
      }
    })
  }

  const stages = Array.isArray(value.stages) ? value.stages : []
  stages.forEach((stage, stageIndex) => {
    if (!isRecord(stage)) return
    validateLabel(stage.label, `stages[${stageIndex}].label`, issues)
    if (!Array.isArray(stage.attempts) || stage.attempts.length === 0) {
      issues.push({ path: `stages[${stageIndex}].attempts`, message: 'Etap wymaga co najmniej jednej próby.' })
      return
    }
    if (stage.attempts.length > 50) {
      issues.push({
        path: `stages[${stageIndex}].attempts`,
        message: 'Etap może zawierać maksymalnie 50 prób.',
      })
    }
    validateUniqueIdentifiers(stage.attempts, `stages[${stageIndex}].attempts`, issues)
    stage.attempts.forEach((attempt, attemptIndex) => {
      if (isRecord(attempt)) {
        validateLabel(attempt.label, `stages[${stageIndex}].attempts[${attemptIndex}].label`, issues)
      }
    })
  })

  const statuses = Array.isArray(value.statuses) ? value.statuses : []
  statuses.forEach((status, index) => {
    if (!isRecord(status)) return
    validateLabel(status.label, `statuses[${index}].label`, issues)
    if (!['valid', 'excluded', 'rank_last'].includes(String(status.kind))) {
      issues.push({ path: `statuses[${index}].kind`, message: 'Nieobsługiwany rodzaj statusu.' })
    }
  })

  const expressionCollections = ['computedFields', 'groups'] as const
  for (const collectionName of expressionCollections) {
    const collection = Array.isArray(value[collectionName]) ? value[collectionName] : []
    collection.forEach((item, index) => {
      if (!isRecord(item)) return
      validateLabel(item.label, `${collectionName}[${index}].label`, issues)
      if (
        collectionName === 'computedFields'
        && !['number', 'duration_ms', 'text', 'boolean'].includes(String(item.type))
      ) {
        issues.push({
          path: `${collectionName}[${index}].type`,
          message: 'Nieobsługiwany typ metryki.',
        })
      }
      const expression = collectionName === 'groups' ? item.source : item.expression
      validateExpression(
        expression,
        `${collectionName}[${index}].${collectionName === 'groups' ? 'source' : 'expression'}`,
        issues,
        { nodes: 0 },
      )
      if (collectionName === 'groups' && item.buckets !== undefined) {
        if (!Array.isArray(item.buckets) || item.buckets.length === 0) {
          issues.push({ path: `${collectionName}[${index}].buckets`, message: 'Przedziały muszą być niepustą tablicą.' })
        } else {
          const bucketKeys = new Set<string>()
          item.buckets.forEach((bucket, bucketIndex) => {
            if (!isRecord(bucket)) {
              issues.push({
                path: `${collectionName}[${index}].buckets[${bucketIndex}]`,
                message: 'Przedział musi być obiektem.',
              })
              return
            }
            validateIdentifier(
              bucket.key,
              `${collectionName}[${index}].buckets[${bucketIndex}].key`,
              issues,
            )
            validateLabel(
              bucket.label,
              `${collectionName}[${index}].buckets[${bucketIndex}].label`,
              issues,
            )
            if (typeof bucket.key === 'string') {
              if (bucketKeys.has(bucket.key)) {
                issues.push({
                  path: `${collectionName}[${index}].buckets[${bucketIndex}].key`,
                  message: 'Klucz przedziału musi być unikalny.',
                })
              }
              bucketKeys.add(bucket.key)
            }
            if (
              typeof bucket.min === 'number'
              && typeof bucket.max === 'number'
              && bucket.min >= bucket.max
            ) {
              issues.push({
                path: `${collectionName}[${index}].buckets[${bucketIndex}]`,
                message: 'Minimum przedziału musi być mniejsze od maksimum.',
              })
            }
          })
        }
      }
    })
  }

  const groupIds = new Set(
    (Array.isArray(value.groups) ? value.groups : [])
      .filter(isRecord)
      .map(group => group.id)
      .filter((id): id is string => typeof id === 'string'),
  )
  const rankingIds = new Set<string>()
  const rankings = Array.isArray(value.rankings) ? value.rankings : []
  rankings.forEach((ranking, index) => {
    if (!isRecord(ranking)) return
    validateLabel(ranking.label, `rankings[${index}].label`, issues)
    if (typeof ranking.id === 'string') rankingIds.add(ranking.id)
    if (!Array.isArray(ranking.groupBy)) {
      issues.push({ path: `rankings[${index}].groupBy`, message: 'Grupowanie musi być tablicą.' })
    } else {
      ranking.groupBy.forEach((groupId, groupIndex) => {
        if (typeof groupId !== 'string' || !groupIds.has(groupId)) {
          issues.push({
            path: `rankings[${index}].groupBy[${groupIndex}]`,
            message: 'Ranking odwołuje się do nieistniejącej grupy.',
          })
        }
      })
    }
    if (ranking.eligibility !== undefined) {
      validateExpression(ranking.eligibility, `rankings[${index}].eligibility`, issues, { nodes: 0 })
    }
    if (!Array.isArray(ranking.orderBy) || ranking.orderBy.length === 0) {
      issues.push({ path: `rankings[${index}].orderBy`, message: 'Ranking wymaga kryterium sortowania.' })
    } else {
      ranking.orderBy.forEach((order, orderIndex) => {
        if (!isRecord(order)) {
          issues.push({ path: `rankings[${index}].orderBy[${orderIndex}]`, message: 'Kryterium musi być obiektem.' })
          return
        }
        validateExpression(
          order.expression,
          `rankings[${index}].orderBy[${orderIndex}].expression`,
          issues,
          { nodes: 0 },
        )
        if (!['asc', 'desc'].includes(String(order.direction))) {
          issues.push({ path: `rankings[${index}].orderBy[${orderIndex}].direction`, message: 'Kierunek musi być asc lub desc.' })
        }
      })
    }
    if (!['competition', 'dense', 'ordinal'].includes(String(ranking.ties))) {
      issues.push({ path: `rankings[${index}].ties`, message: 'Nieobsługiwana metoda rozstrzygania remisów.' })
    }
  })

  const allowedBlockTypes = new Set([
    'current_entry',
    'next_up',
    'result_table',
    'leaderboard',
    'podium',
    'metric',
    'progress',
    'message',
  ])
  const viewComputedIds = new Set(
    (Array.isArray(value.computedFields) ? value.computedFields : [])
      .filter(isRecord)
      .map(field => field.id)
      .filter((id): id is string => typeof id === 'string'),
  )
  const views = Array.isArray(value.views) ? value.views : []
  views.forEach((view, viewIndex) => {
    if (!isRecord(view)) return
    validateLabel(view.label, `views[${viewIndex}].label`, issues)
    if (!['live', 'results'].includes(String(view.kind))) {
      issues.push({ path: `views[${viewIndex}].kind`, message: 'Widok musi mieć rodzaj live albo results.' })
    }
    if (!Array.isArray(view.blocks)) {
      issues.push({ path: `views[${viewIndex}].blocks`, message: 'Widok musi zawierać tablicę bloków.' })
      return
    }
    if (view.blocks.length > 50) {
      issues.push({
        path: `views[${viewIndex}].blocks`,
        message: 'Widok może zawierać maksymalnie 50 bloków.',
      })
    }
    validateUniqueIdentifiers(view.blocks, `views[${viewIndex}].blocks`, issues)
    view.blocks.forEach((block, blockIndex) => {
      if (!isRecord(block)) return
      if (!allowedBlockTypes.has(String(block.type))) {
        issues.push({ path: `views[${viewIndex}].blocks[${blockIndex}].type`, message: 'Nieobsługiwany blok widoku.' })
      }
      if (
        block.rankingId !== undefined
        && (typeof block.rankingId !== 'string' || !rankingIds.has(block.rankingId))
      ) {
        issues.push({
          path: `views[${viewIndex}].blocks[${blockIndex}].rankingId`,
          message: 'Blok odwołuje się do nieistniejącego rankingu.',
        })
      }
      if (block.fields !== undefined) {
        if (!Array.isArray(block.fields)) {
          issues.push({
            path: `views[${viewIndex}].blocks[${blockIndex}].fields`,
            message: 'Pola bloku muszą być tablicą.',
          })
        } else {
          block.fields.forEach((fieldPath, fieldIndex) => {
            const fieldId = typeof fieldPath === 'string'
              ? fieldPath.split('.').at(-1)
              : null
            if (!fieldId || !viewComputedIds.has(fieldId)) {
              issues.push({
                path: `views[${viewIndex}].blocks[${blockIndex}].fields[${fieldIndex}]`,
                message: 'Blok odwołuje się do nieistniejącej metryki.',
              })
            }
          })
        }
      }
    })
  })

  const eventFieldIds = new Set(
    (Array.isArray(value.eventFields) ? value.eventFields : [])
      .filter(isRecord)
      .map(field => field.id)
      .filter((id): id is string => typeof id === 'string'),
  )
  const resultFieldIds = new Set(
    (Array.isArray(value.resultFields) ? value.resultFields : [])
      .filter(isRecord)
      .map(field => field.id)
      .filter((id): id is string => typeof id === 'string'),
  )
  const computedDefinitions = (Array.isArray(value.computedFields) ? value.computedFields : [])
    .filter(isRecord)
  const computedIds = new Set(
    computedDefinitions
      .map(field => field.id)
      .filter((id): id is string => typeof id === 'string'),
  )
  const allowedReferenceRoots = new Set([
    'event',
    'participant',
    'registration',
    'attempts',
    'valid_attempts',
    'computed',
    'groups',
  ])

  function validateReferences(expression: unknown, path: string) {
    if (!isRecord(expression) || typeof expression.op !== 'string') return
    const refs = collectExpressionReferences(expression as unknown as CompetitionExpression)
    refs.forEach(reference => {
      const [root, second, third] = reference.split('.')
      if (!allowedReferenceRoots.has(root)) {
        issues.push({ path, message: `Nieobsługiwane źródło danych: ${root}.` })
      } else if (root === 'event' && second && !eventFieldIds.has(second)) {
        issues.push({ path, message: `Nie istnieje parametr wydarzenia ${second}.` })
      } else if (root === 'computed' && second && !computedIds.has(second)) {
        issues.push({ path, message: `Nie istnieje metryka obliczana ${second}.` })
      } else if (root === 'groups' && second && !groupIds.has(second)) {
        issues.push({ path, message: `Nie istnieje grupa ${second}.` })
      } else if (
        (root === 'attempts' || root === 'valid_attempts')
        && second === 'values'
        && third
        && !resultFieldIds.has(third)
      ) {
        issues.push({ path, message: `Nie istnieje pole wyniku ${third}.` })
      }
    })
  }

  computedDefinitions.forEach((field, index) =>
    validateReferences(field.expression, `computedFields[${index}].expression`)
  )
  ;(Array.isArray(value.groups) ? value.groups : []).filter(isRecord).forEach((group, index) =>
    validateReferences(group.source, `groups[${index}].source`)
  )
  rankings.filter(isRecord).forEach((ranking, rankingIndex) => {
    if (ranking.eligibility !== undefined) {
      validateReferences(ranking.eligibility, `rankings[${rankingIndex}].eligibility`)
    }
    if (Array.isArray(ranking.orderBy)) {
      ranking.orderBy.filter(isRecord).forEach((order, orderIndex) =>
        validateReferences(order.expression, `rankings[${rankingIndex}].orderBy[${orderIndex}].expression`)
      )
    }
  })

  const dependencyMap = new Map<string, string[]>()
  computedDefinitions.forEach(field => {
    if (typeof field.id !== 'string' || !isRecord(field.expression)) return
    dependencyMap.set(
      field.id,
      collectExpressionReferences(field.expression as unknown as CompetitionExpression)
        .filter(reference => reference.startsWith('computed.'))
        .map(reference => reference.split('.')[1])
        .filter(Boolean),
    )
  })
  const visited = new Set<string>()
  const visiting = new Set<string>()
  function visitComputed(id: string): boolean {
    if (visited.has(id)) return false
    if (visiting.has(id)) return true
    visiting.add(id)
    for (const dependency of dependencyMap.get(id) ?? []) {
      if (visitComputed(dependency)) return true
    }
    visiting.delete(id)
    visited.add(id)
    return false
  }
  for (const id of dependencyMap.keys()) {
    if (visitComputed(id)) {
      issues.push({ path: 'computedFields', message: 'Metryki obliczane zawierają cykliczną zależność.' })
      break
    }
  }

  if (issues.length > 0) return { success: false, issues }
  return { success: true, data: value as unknown as CompetitionFormatDefinition }
}

function projectPath(value: unknown, segments: string[]): EvaluationValue {
  if (segments.length === 0) {
    if (Array.isArray(value)) return value.map(item => projectPath(item, []))
    return isScalar(value) ? value : null
  }
  const [segment, ...rest] = segments
  if (Array.isArray(value)) {
    return value.map(item => projectPath(item, segments))
  }
  if (!isRecord(value)) return null
  return projectPath(value[segment], rest)
}

function flattenValues(value: EvaluationValue): CompetitionScalar[] {
  return Array.isArray(value)
    ? value.flatMap(flattenValues)
    : [value]
}

function numericValues(values: EvaluationValue[]): number[] {
  return values
    .flatMap(flattenValues)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
}

function firstScalar(value: EvaluationValue): CompetitionScalar {
  return flattenValues(value)[0] ?? null
}

export function evaluateCompetitionExpression(
  expression: CompetitionExpression,
  context: Record<string, unknown>,
): EvaluationValue {
  switch (expression.op) {
    case 'literal':
      return expression.value
    case 'ref':
      return projectPath(context, expression.path.split('.'))
    case 'coalesce': {
      for (const argument of expression.args) {
        const value = firstScalar(evaluateCompetitionExpression(argument, context))
        if (value !== null) return value
      }
      return null
    }
    case 'min':
    case 'max':
    case 'sum':
    case 'average': {
      const values = numericValues(expression.args.map(argument =>
        evaluateCompetitionExpression(argument, context)
      ))
      if (values.length === 0) return null
      if (expression.op === 'min') return Math.min(...values)
      if (expression.op === 'max') return Math.max(...values)
      const sum = values.reduce((total, value) => total + value, 0)
      return expression.op === 'sum' ? sum : sum / values.length
    }
    case 'add':
    case 'subtract':
    case 'multiply':
    case 'divide': {
      const values = expression.args.map(argument =>
        firstScalar(evaluateCompetitionExpression(argument, context))
      )
      if (values.some(value => typeof value !== 'number' || !Number.isFinite(value))) return null
      const numbers = values as number[]
      if (expression.op === 'add') return numbers.reduce((total, value) => total + value, 0)
      if (expression.op === 'subtract') return numbers.slice(1).reduce((total, value) => total - value, numbers[0])
      if (expression.op === 'multiply') return numbers.reduce((total, value) => total * value, 1)
      return numbers.slice(1).reduce<number | null>(
        (total, value) => total === null || value === 0 ? null : total / value,
        numbers[0],
      )
    }
    case 'round': {
      const value = firstScalar(evaluateCompetitionExpression(expression.value, context))
      if (typeof value !== 'number' || !Number.isFinite(value)) return null
      const factor = 10 ** (expression.precision ?? 0)
      return Math.round(value * factor) / factor
    }
    case 'eq':
    case 'neq':
    case 'lt':
    case 'lte':
    case 'gt':
    case 'gte': {
      const left = firstScalar(evaluateCompetitionExpression(expression.left, context))
      const right = firstScalar(evaluateCompetitionExpression(expression.right, context))
      if (expression.op === 'eq') return left === right
      if (expression.op === 'neq') return left !== right
      if (left === null || right === null || typeof left !== typeof right) return false
      if (expression.op === 'lt') return left < right
      if (expression.op === 'lte') return left <= right
      if (expression.op === 'gt') return left > right
      return left >= right
    }
    case 'and':
      return expression.args.every(argument =>
        Boolean(firstScalar(evaluateCompetitionExpression(argument, context)))
      )
    case 'or':
      return expression.args.some(argument =>
        Boolean(firstScalar(evaluateCompetitionExpression(argument, context)))
      )
    case 'not':
      return !Boolean(firstScalar(evaluateCompetitionExpression(expression.value, context)))
    case 'if':
      return evaluateCompetitionExpression(
        Boolean(firstScalar(evaluateCompetitionExpression(expression.condition, context)))
          ? expression.then
          : expression.else,
        context,
      )
  }
}

function groupValue(
  definition: CompetitionFormatDefinition['groups'][number],
  context: Record<string, unknown>,
): string | null {
  const rawValue = firstScalar(evaluateCompetitionExpression(definition.source, context))
  if (definition.buckets?.length) {
    if (typeof rawValue !== 'number' || !Number.isFinite(rawValue)) return null
    const bucket = definition.buckets.find(candidate =>
      (candidate.min === undefined || rawValue >= candidate.min)
      && (candidate.max === undefined || rawValue < candidate.max)
    )
    return bucket?.key ?? null
  }
  return rawValue === null ? null : String(rawValue)
}

function compareScalars(
  left: CompetitionScalar,
  right: CompetitionScalar,
  direction: 'asc' | 'desc',
  nulls: 'first' | 'last',
): number {
  if (left === null && right === null) return 0
  if (left === null) return nulls === 'first' ? -1 : 1
  if (right === null) return nulls === 'first' ? 1 : -1
  let comparison = 0
  if (typeof left === 'number' && typeof right === 'number') comparison = left - right
  else comparison = String(left).localeCompare(String(right), 'pl')
  return direction === 'asc' ? comparison : -comparison
}

export function calculateCompetitionResults(
  definition: CompetitionFormatDefinition,
  entrants: CompetitionEntrantInput[],
): CompetitionCalculatedRow[] {
  const statusKinds = new Map(definition.statuses.map(status => [status.id, status.kind]))
  const contexts = entrants.map(entrant => {
    const computed: Record<string, CompetitionScalar> = {}
    const validAttempts = entrant.attempts.filter(attempt =>
      attempt.status === null || statusKinds.get(attempt.status) === 'valid'
    )
    const context: Record<string, unknown> = {
      event: entrant.event,
      participant: entrant.participant,
      registration: entrant.registration,
      attempts: entrant.attempts,
      valid_attempts: validAttempts,
      computed,
      groups: {},
    }
    const computedById = new Map(definition.computedFields.map(field => [field.id, field]))
    const resolved = new Set<string>()
    const resolving = new Set<string>()
    function resolveComputed(id: string): CompetitionScalar {
      if (resolved.has(id)) return computed[id] ?? null
      if (resolving.has(id)) return null
      const field = computedById.get(id)
      if (!field) return null
      resolving.add(id)
      collectExpressionReferences(field.expression)
        .filter(reference => reference.startsWith('computed.'))
        .map(reference => reference.split('.')[1])
        .forEach(resolveComputed)
      computed[id] = firstScalar(evaluateCompetitionExpression(field.expression, context))
      resolving.delete(id)
      resolved.add(id)
      return computed[id]
    }
    definition.computedFields.forEach(field => resolveComputed(field.id))

    const groups = Object.fromEntries(
      definition.groups.map(group => [group.id, groupValue(group, context)])
    )
    context.groups = groups
    const row: CompetitionCalculatedRow = {
      participantId: entrant.participantId,
      computed,
      groups,
      ranks: Object.fromEntries(definition.rankings.map(ranking => [ranking.id, null])),
    }

    return {
      entrant,
      context,
      row,
    }
  })

  for (const ranking of definition.rankings) {
    const grouped = new Map<string, typeof contexts>()
    for (const item of contexts) {
      const groupKey = ranking.groupBy.length === 0
        ? '__all'
        : ranking.groupBy.map(groupId => item.row.groups[groupId] ?? '__none').join('\u001f')
      const group = grouped.get(groupKey) ?? []
      group.push(item)
      grouped.set(groupKey, group)
    }

    for (const group of grouped.values()) {
      const eligible = group.filter(item =>
        ranking.eligibility === undefined
        || Boolean(firstScalar(evaluateCompetitionExpression(ranking.eligibility, item.context)))
      )

      const ordered = eligible.map(item => ({
        item,
        values: ranking.orderBy.map(order =>
          firstScalar(evaluateCompetitionExpression(order.expression, item.context))
        ),
      })).sort((left, right) => {
        for (let index = 0; index < ranking.orderBy.length; index += 1) {
          const order = ranking.orderBy[index]
          const comparison = compareScalars(
            left.values[index],
            right.values[index],
            order.direction,
            order.nulls ?? 'last',
          )
          if (comparison !== 0) return comparison
        }
        return left.item.entrant.participantId.localeCompare(right.item.entrant.participantId)
      })

      let previousValues: CompetitionScalar[] | null = null
      let previousRank = 0
      ordered.forEach((orderedItem, index) => {
        const tied = previousValues !== null
          && orderedItem.values.every((value, valueIndex) => value === previousValues?.[valueIndex])
        let rank: number
        if (ranking.ties === 'ordinal') rank = index + 1
        else if (tied) rank = previousRank
        else if (ranking.ties === 'dense') rank = previousRank + 1
        else rank = index + 1
        orderedItem.item.row.ranks[ranking.id] = rank
        previousValues = orderedItem.values
        previousRank = rank
      })
    }
  }

  return contexts.map(item => item.row)
}
