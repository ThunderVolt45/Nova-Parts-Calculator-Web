import { describe, expect, it } from 'vitest'

import { partsCatalogById } from '../../data/catalog/catalog.ts'
import { validateAssembly } from './validateAssembly.ts'

describe('validateAssembly', () => {
  it('accepts a compatible assembly within its load capacity', () => {
    expect(
      validateAssembly(
        { leg: 40, body: 1, weapon: 1, accessory: 0 },
        partsCatalogById,
      ),
    ).toEqual({
      isValid: true,
      status: 'complete',
      issues: [],
      invalidPartSlots: [],
      weightInvalid: false,
    })
  })

  it('reports every simultaneous issue while preserving Python status priority', () => {
    const result = validateAssembly(
      { leg: 0, body: 10, weapon: 60, accessory: 28 },
      partsCatalogById,
    )

    expect(result.status).toBe('parts-missing')
    expect(result.issues).toEqual([
      'leg-missing',
      'load-exceeded',
      'apocalypse-body-too-light',
      'apocalypse-towering-conflict',
    ])
    expect(result.invalidPartSlots).toEqual(['leg', 'body', 'accessory'])
    expect(result.weightInvalid).toBe(true)
  })

  it('marks every N part when more than one is selected', () => {
    const result = validateAssembly(
      { leg: 10, body: 11, weapon: 4, accessory: 0 },
      partsCatalogById,
    )

    expect(result.issues).toContain('n-part-limit-exceeded')
    expect(result.invalidPartSlots).toEqual(['leg', 'body', 'weapon'])
  })

  it('rejects unknown IDs instead of treating them as array positions', () => {
    expect(() =>
      validateAssembly(
        { leg: 9999, body: 1, weapon: 1, accessory: 0 },
        partsCatalogById,
      ),
    ).toThrow('Unknown leg catalog ID: 9999')
  })
})
