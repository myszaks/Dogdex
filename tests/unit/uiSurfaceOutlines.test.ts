import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap(entry => {
    const path = join(directory, entry)
    return statSync(path).isDirectory()
      ? sourceFiles(path)
      : path.endsWith('.tsx')
        ? [path]
        : []
  })
}

const uiSources = [...sourceFiles('app'), ...sourceFiles('components')]
const neutralOutline = /border-(?:border|sage-200|slate-200|\[#E2E8F0\]|\[#dfe8d8\])/u
const surfaceShadow = /shadow-(?:sm|md|lg|xl|2xl)/u

describe('neutral UI surface outlines', () => {
  it('does not combine a neutral outline with a surface shadow', () => {
    const violations = uiSources.flatMap(path =>
      readFileSync(path, 'utf8')
        .split('\n')
        .map((line, index) => ({ path: relative(process.cwd(), path), line: index + 1, source: line.trim() }))
        .filter(item => neutralOutline.test(item.source) && surfaceShadow.test(item.source)),
    )

    expect(violations).toEqual([])
  })

  it('does not use neutral inset rings on shared surfaces', () => {
    const violations = uiSources.flatMap(path => {
      const source = readFileSync(path, 'utf8')
      return /ring-1 ring-(?:foreground\/10|slate-200|sage-200)/u.test(source)
        ? [relative(process.cwd(), path)]
        : []
    })

    expect(violations).toEqual([])
  })

  it('keeps the user menu free from internal separators', () => {
    const source = readFileSync('components/UserMenu.tsx', 'utf8')

    expect(source).not.toContain('<hr')
    expect(source).not.toContain('border-b border-border')
  })
})
