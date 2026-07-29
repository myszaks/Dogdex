import { describe, expect, it } from 'vitest'
import { safeInternalPath } from '@/lib/safeRedirect'

describe('safeInternalPath', () => {
  it('keeps local paths and query strings', () => {
    expect(safeInternalPath('/reset-password?token=1')).toBe('/reset-password?token=1')
  })

  it('rejects protocol-relative and backslash redirects', () => {
    expect(safeInternalPath('//evil.example/path')).toBe('/')
    expect(safeInternalPath('/\\evil.example')).toBe('/')
  })

  it('rejects absolute and control-character redirects', () => {
    expect(safeInternalPath('https://evil.example')).toBe('/')
    expect(safeInternalPath('/profile\nLocation: https://evil.example')).toBe('/')
  })
})
