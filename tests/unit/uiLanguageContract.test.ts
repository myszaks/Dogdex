import { readFileSync, readdirSync } from 'node:fs'
import { extname, join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function collectSources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return collectSources(path)
    return ['.ts', '.tsx'].includes(extname(entry.name)) ? [path] : []
  })
}

const interfaceSource = [
  ...collectSources(resolve(process.cwd(), 'app')),
  ...collectSources(resolve(process.cwd(), 'components')),
  ...collectSources(resolve(process.cwd(), 'lib')),
].map(path => readFileSync(path, 'utf8')).join('\n')

describe('Polish interface language contract', () => {
  it('uses “na żywo” instead of mixed Polish-English labels', () => {
    expect(interfaceSource).not.toMatch(
      /Wyniki live|wyniki live|Transmisja live|transmisja live|Wyniki i live|Widok live|Obsługa live|Klasyfikacja live/,
    )
  })

  it('does not alter the grammatical casing of Polish dates with CSS', () => {
    const uiSource = [
      ...collectSources(resolve(process.cwd(), 'app')),
      ...collectSources(resolve(process.cwd(), 'components')),
    ].map(path => readFileSync(path, 'utf8')).join('\n')

    expect(uiSource).not.toMatch(/\bcapitalize\b/)
  })

  it('keeps corrected Polish interface spellings', () => {
    expect(interfaceSource).not.toMatch(
      /\b(?:Nie udalo|Blad przy|Ladowanie|Wroc do|Szczegoly|Nadchodzace|treningow|Uzytkownik|niedostepny)\b/,
    )
  })
})
