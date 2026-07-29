import type {
  CompetitionAttemptInput,
  CompetitionFieldDefinition,
  CompetitionFormatDefinition,
  CompetitionScalar,
} from '@/types/competition'

function hasValue(value: CompetitionScalar | undefined): boolean {
  return value !== null && value !== undefined && value !== ''
}

export function isAttemptComplete(
  resultFields: CompetitionFieldDefinition[],
  attempt: CompetitionAttemptInput | undefined,
): boolean {
  if (!attempt) return false
  if (attempt.status) return true
  return resultFields
    .filter(field => field.required)
    .every(field => hasValue(attempt.values[field.id]))
}

export function isParticipantCompetitionComplete(
  definition: CompetitionFormatDefinition,
  attempts: CompetitionAttemptInput[],
): boolean {
  const attemptByKey = new Map(
    attempts.map(attempt => [`${attempt.stageId}\u001f${attempt.attemptId}`, attempt]),
  )
  const configuredAttempts = definition.stages.flatMap(stage =>
    stage.attempts.map(attempt => ({
      stageId: stage.id,
      attemptId: attempt.id,
    }))
  )
  return configuredAttempts.length > 0 && configuredAttempts.every(attempt =>
    isAttemptComplete(
      definition.resultFields,
      attemptByKey.get(`${attempt.stageId}\u001f${attempt.attemptId}`),
    )
  )
}
