import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import {
  catalogSourceRevision,
  partsCatalog,
  partsCatalogById,
} from '../../data/catalog/catalog.ts'
import validationGoldenInput from './fixtures/assembly-validation.golden.json'
import { assemblyPartIdsSchema } from './schema.ts'
import {
  assemblyValidationStatusSchema,
  validateAssembly,
} from './validateAssembly.ts'

const invalidPartSlotSchema = z.enum(['leg', 'body', 'weapon', 'accessory'])
const validationGoldenFixtureSchema = z.strictObject({
  catalogVersion: z.string(),
  sourceRevision: z.string(),
  randomSeed: z.number().int(),
  randomCases: z.number().int().positive(),
  cases: z.array(
    z.strictObject({
      name: z.string(),
      partIds: assemblyPartIdsSchema,
      expected: z.strictObject({
        isValid: z.boolean(),
        status: assemblyValidationStatusSchema,
        invalidPartSlots: z.array(invalidPartSlotSchema),
        weightInvalid: z.boolean(),
      }),
    }),
  ),
})

const goldenFixture = validationGoldenFixtureSchema.parse(validationGoldenInput)

describe('Python assembly validation equivalence', () => {
  it('matches the catalog revision and covers every validation status', () => {
    expect(goldenFixture.catalogVersion).toBe(partsCatalog.catalogVersion)
    expect(goldenFixture.sourceRevision).toBe(catalogSourceRevision)
    expect(goldenFixture.randomSeed).toBe(149_206)
    expect(goldenFixture.randomCases).toBe(512)
    expect(goldenFixture.cases).toHaveLength(527)
    expect(
      new Set(goldenFixture.cases.map((testCase) => testCase.expected.status)),
    ).toEqual(
      new Set([
        'complete',
        'parts-missing',
        'mount-type-mismatch',
        'load-exceeded',
        'n-part-limit-exceeded',
        'apocalypse-body-too-light',
        'apocalypse-towering-conflict',
      ]),
    )
  })

  it('matches every PyQt status and error target', () => {
    for (const testCase of goldenFixture.cases) {
      const result = validateAssembly(testCase.partIds, partsCatalogById)

      expect(
        {
          isValid: result.isValid,
          status: result.status,
          invalidPartSlots: result.invalidPartSlots,
          weightInvalid: result.weightInvalid,
        },
        testCase.name,
      ).toEqual(testCase.expected)
    }
  })
})
