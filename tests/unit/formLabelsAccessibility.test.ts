import { readFileSync, readdirSync } from 'node:fs'
import { extname, join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function collectTsxFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return collectTsxFiles(path)
    return extname(entry.name) === '.tsx' ? [path] : []
  })
}

describe('application form label accessibility contract', () => {
  it('uses explicit htmlFor on every native form label', () => {
    const root = process.cwd()
    const files = [
      ...collectTsxFiles(resolve(root, 'app')),
      ...collectTsxFiles(resolve(root, 'components')),
    ].filter(file => !file.endsWith(join('components', 'ui', 'label.tsx')))

    const invalidLabels = files.flatMap(file => {
      const source = readFileSync(file, 'utf8')
      return [...source.matchAll(/<label\b([^>]*)>/g)]
        .filter(label => !label[1].includes('htmlFor='))
        .map(label => `${relative(root, file)}: ${label[0]}`)
    })

    expect(invalidLabels).toEqual([])
  })
})
