import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const FORM_FILES = [
  'app/organizer/events/new/page.tsx',
  'app/organizer/events/[eventId]/edit/EditEventClient.tsx',
  'components/CompetitionFormatStudio.tsx',
  'components/CompetitionFormatPicker.tsx',
  'components/EventResultsSetup.tsx',
  'components/FormBuilder.tsx',
  'components/FormTemplatePicker.tsx',
  'components/MapPicker.tsx',
  'components/OptionReorder.tsx',
  'components/SpeedwayClassEditor.tsx',
]

describe('creator form accessibility contract', () => {
  it.each(FORM_FILES)('uses explicit htmlFor on every label in %s', file => {
    const source = readFileSync(resolve(process.cwd(), file), 'utf8')
    const labels = [...source.matchAll(/<label\b([^>]*)>/g)]

    expect(labels.length).toBeGreaterThan(0)
    for (const label of labels) {
      expect(label[1], `Label without htmlFor in ${file}: ${label[0]}`).toContain('htmlFor=')
    }
  })

  it('connects creator validation messages to invalid fields', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'app/organizer/events/new/page.tsx'),
      'utf8',
    )

    expect(source).toContain('aria-describedby')
    expect(source).toContain('CREATOR_ERROR_ID')
    expect(source).toContain('aria-invalid')
  })
})
