export type ReviewType = 'event' | 'training'
export type ReviewModerationStatus = 'published' | 'hidden' | 'removed'

export function reviewTable(type: ReviewType) {
  return type === 'event' ? 'event_reviews' as const : 'training_reviews' as const
}

export function parseReviewType(value: unknown): ReviewType | null {
  return value === 'event' || value === 'training' ? value : null
}

export const reviewReportReasons = ['spam', 'offensive', 'privacy', 'conflict', 'other'] as const
export type ReviewReportReason = typeof reviewReportReasons[number]

export function isReviewReportReason(value: unknown): value is ReviewReportReason {
  return typeof value === 'string' && reviewReportReasons.includes(value as ReviewReportReason)
}
