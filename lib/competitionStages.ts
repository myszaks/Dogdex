import type {
  CompetitionFieldDefinition,
  CompetitionFormatDefinition,
} from '@/types/competition'

export function fieldAppliesToStage(
  field: CompetitionFieldDefinition,
  stageId: string,
): boolean {
  return field.stageIds === undefined || field.stageIds.includes(stageId)
}

export function resultFieldsForStage(
  definition: Pick<CompetitionFormatDefinition, 'resultFields'>,
  stageId: string,
): CompetitionFieldDefinition[] {
  return definition.resultFields.filter(field => fieldAppliesToStage(field, stageId))
}
