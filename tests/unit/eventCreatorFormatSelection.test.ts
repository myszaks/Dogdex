import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  isPreselectedFormatBlocking,
  type PreselectedFormatStatus,
} from '@/lib/eventCreatorFormatSelection'

describe('preselected competition format loading', () => {
  it.each([
    ['checking', true],
    ['loading', true],
    ['error', true],
    ['idle', false],
    ['ready', false],
  ] as Array<[PreselectedFormatStatus, boolean]>)(
    'maps %s to blocking=%s',
    (status, expected) => {
      expect(isPreselectedFormatBlocking(status)).toBe(expected)
    },
  )

  it('guards navigation and both event save modes in the creator', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'app/organizer/events/new/page.tsx'),
      'utf8',
    )

    expect(source).toContain('if (preselectedFormatBlocking) return')
    expect(source).toContain('disabled={preselectedFormatBlocking}')
    expect(source).toContain('disabled={loading || preselectedFormatBlocking}')
    expect(source).toContain("useState<PreselectedFormatStatus>('checking')")
  })
})
