import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import {
  catalogSourceRevision,
  partsCatalog,
  partsCatalogById,
} from '../../data/catalog/catalog.ts'
import { calculateAssemblyStats } from './calculateFinalStats.ts'
import finalGoldenInput from './fixtures/final-calculation.golden.json'
import { baseCalculationInputSchema } from './schema.ts'
import {
  finalCalculationResultSchema,
  simulationInputSchema,
} from './simulationSchema.ts'

const finalGoldenFixtureSchema = z.strictObject({
  catalogVersion: z.string(),
  sourceRevision: z.string(),
  randomSeed: z.number().int(),
  randomCases: z.number().int().positive(),
  cases: z.array(
    z.strictObject({
      name: z.string(),
      baseInput: baseCalculationInputSchema,
      simulation: simulationInputSchema,
      expected: finalCalculationResultSchema,
    }),
  ),
})

const goldenFixture = finalGoldenFixtureSchema.parse(finalGoldenInput)

describe('Python final calculation equivalence', () => {
  it('matches the imported catalog revision and expected coverage', () => {
    expect(goldenFixture.catalogVersion).toBe(partsCatalog.catalogVersion)
    expect(goldenFixture.sourceRevision).toBe(catalogSourceRevision)
    expect(goldenFixture.randomSeed).toBe(149_205)
    expect(goldenFixture.randomCases).toBe(256)
    expect(goldenFixture.cases).toHaveLength(274)
  })

  it('matches every PyQt representative, boundary, and random case', () => {
    for (const testCase of goldenFixture.cases) {
      const result = calculateAssemblyStats(
        testCase.baseInput,
        testCase.simulation,
        partsCatalogById,
      )

      expect(result.final, testCase.name).toEqual(testCase.expected)
    }
  })
})
