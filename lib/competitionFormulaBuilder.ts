import type { CompetitionExpression } from '@/types/competition'

export type ScoreAggregation = 'min' | 'max' | 'sum' | 'average'

export interface WeightedScoreTerm {
  fieldId: string
  aggregation: ScoreAggregation
  operation: 'add' | 'subtract'
  multiplier: number
}

export interface WeightedScoreRecipe {
  terms: WeightedScoreTerm[]
  precision: number
}

const AGGREGATIONS = new Set<ScoreAggregation>(['min', 'max', 'sum', 'average'])

export function buildWeightedScoreExpression(
  recipe: WeightedScoreRecipe,
): CompetitionExpression {
  const terms = recipe.terms.map(term => ({
    op: 'multiply' as const,
    args: [
      {
        op: term.aggregation,
        args: [{ op: 'ref' as const, path: `valid_attempts.values.${term.fieldId}` }],
      },
      {
        op: 'literal' as const,
        value: (term.operation === 'subtract' ? -1 : 1) * Math.abs(term.multiplier),
      },
    ],
  }))

  return {
    op: 'round',
    precision: Math.max(0, Math.min(8, Math.trunc(recipe.precision))),
    value: {
      op: 'add',
      args: terms,
    },
  }
}

export function parseWeightedScoreExpression(
  expression: CompetitionExpression,
): WeightedScoreRecipe | null {
  if (
    expression.op !== 'round'
    || expression.value.op !== 'add'
    || expression.value.args.length === 0
  ) {
    return null
  }

  const terms: WeightedScoreTerm[] = []
  for (const expressionTerm of expression.value.args) {
    if (expressionTerm.op !== 'multiply' || expressionTerm.args.length !== 2) return null
    const [aggregate, multiplierExpression] = expressionTerm.args
    if (
      !AGGREGATIONS.has(aggregate.op as ScoreAggregation)
      || !('args' in aggregate)
      || aggregate.args.length !== 1
      || aggregate.args[0].op !== 'ref'
      || !aggregate.args[0].path.startsWith('valid_attempts.values.')
      || multiplierExpression.op !== 'literal'
      || typeof multiplierExpression.value !== 'number'
      || !Number.isFinite(multiplierExpression.value)
    ) {
      return null
    }
    const fieldId = aggregate.args[0].path.split('.').at(-1)
    if (!fieldId) return null
    terms.push({
      fieldId,
      aggregation: aggregate.op as ScoreAggregation,
      operation: multiplierExpression.value < 0 ? 'subtract' : 'add',
      multiplier: Math.abs(multiplierExpression.value),
    })
  }

  return {
    terms,
    precision: expression.precision ?? 0,
  }
}

export function describeWeightedScoreRecipe(
  recipe: WeightedScoreRecipe,
  fieldLabels: Record<string, string>,
) {
  return recipe.terms.map((term, index) => {
    const sign = index === 0
      ? term.operation === 'subtract' ? '− ' : ''
      : term.operation === 'subtract' ? ' − ' : ' + '
    const multiplier = term.multiplier === 1 ? '' : `${term.multiplier} × `
    return `${sign}${multiplier}${fieldLabels[term.fieldId] ?? term.fieldId}`
  }).join('')
}
