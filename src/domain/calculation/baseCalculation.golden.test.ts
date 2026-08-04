import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { catalogSourceRevision, partsCatalog, partsCatalogById } from '../../data/catalog/catalog.ts'
import goldenInput from './fixtures/base-calculation.golden.json'
import { calculateBaseStats } from './calculateBaseStats.ts'
import {
  baseCalculationInputSchema,
  baseCalculationResultSchema,
} from './schema.ts'

const goldenFixtureSchema = z.strictObject({
  catalogVersion: z.string(),
  sourceRevision: z.string(),
  randomSeed: z.number().int(),
  randomCasesPerMode: z.number().int().positive(),
  cases: z.array(
    z.strictObject({
      name: z.string(),
      input: baseCalculationInputSchema,
      expected: baseCalculationResultSchema,
    }),
  ),
})

const goldenFixture = goldenFixtureSchema.parse(goldenInput)

describe('Python base calculation equivalence', () => {
  it('matches the imported catalog revision and expected case coverage', () => {
    expect(goldenFixture.catalogVersion).toBe(partsCatalog.catalogVersion)
    expect(goldenFixture.sourceRevision).toBe(catalogSourceRevision)
    expect(goldenFixture.randomSeed).toBe(1492)
    expect(goldenFixture.randomCasesPerMode).toBe(256)
    expect(goldenFixture.cases).toHaveLength(526)
    expect(
      goldenFixture.cases.filter((testCase) =>
        testCase.name.startsWith('curated-integer-'),
      ),
    ).toHaveLength(7)
    expect(
      goldenFixture.cases.filter((testCase) =>
        testCase.name.startsWith('curated-float-'),
      ),
    ).toHaveLength(7)
  })

  it('matches every representative, boundary, and deterministic random case', () => {
    for (const testCase of goldenFixture.cases) {
      expect(
        calculateBaseStats(testCase.input, partsCatalogById),
        testCase.name,
      ).toEqual(testCase.expected)
    }
  })

  it('reports unknown catalog IDs instead of using array positions', () => {
    const input = goldenFixture.cases[0]!.input

    expect(() =>
      calculateBaseStats(
        {
          ...input,
          partIds: { ...input.partIds, leg: 9999 },
        },
        partsCatalogById,
      ),
    ).toThrow('Unknown leg catalog ID: 9999')
  })
})
