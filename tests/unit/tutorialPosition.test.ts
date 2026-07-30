import { describe, expect, it } from 'vitest'
import { chooseTutorialVerticalSide } from '@/lib/tutorialPosition'

describe('mobile tutorial placement', () => {
  it('places the prompt at the bottom for a field in the upper half', () => {
    expect(chooseTutorialVerticalSide(80, 140, 800)).toBe('bottom')
  })

  it('places the prompt at the top for a field in the lower half', () => {
    expect(chooseTutorialVerticalSide(620, 680, 800)).toBe('top')
  })

  it('uses the center of a tall active target', () => {
    expect(chooseTutorialVerticalSide(200, 700, 800)).toBe('top')
  })
})
