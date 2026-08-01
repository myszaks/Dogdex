import { describe, expect, it } from 'vitest'
import { cancellationRequestParticipant } from '@/lib/cancellationRequestParticipant'

const participant = {
  dog_name: 'Luna',
  owner_name: 'Anna Nowak',
  owner_email: 'anna@example.com',
}

describe('cancellationRequestParticipant', () => {
  it('normalizes a to-one Supabase relation', () => {
    expect(cancellationRequestParticipant({ participants: participant })).toEqual(participant)
  })

  it('normalizes array-shaped nested relations', () => {
    expect(cancellationRequestParticipant([{
      participants: [participant],
    }])).toEqual(participant)
  })

  it('returns null when the participant relation is missing', () => {
    expect(cancellationRequestParticipant({ participants: null })).toBeNull()
  })
})
