import { z } from 'zod'

const catalogIdSchema = z.number().int().nonnegative()
const reinforcementValueSchema = z.number().int().min(0).max(100)

const partReinforcementSchema = z.strictObject({
  watt: reinforcementValueSchema,
  health: reinforcementValueSchema,
  damage: reinforcementValueSchema,
})

export const assemblyPartIdsSchema = z.strictObject({
  leg: catalogIdSchema,
  body: catalogIdSchema,
  weapon: catalogIdSchema,
  accessory: catalogIdSchema,
})

export const baseCalculationInputSchema = z.strictObject({
  partIds: assemblyPartIdsSchema,
  subcoreIds: z.strictObject({
    leg: catalogIdSchema,
    body: catalogIdSchema,
    weapon: catalogIdSchema,
  }),
  reinforcement: z.strictObject({
    leg: partReinforcementSchema,
    body: partReinforcementSchema,
    weapon: partReinforcementSchema,
  }),
  accessoryRandomOptions: z.strictObject({
    health: z.number().int().min(0).max(200),
    damage: z.number().int().min(0).max(20),
    armor: z.number().int().min(0).max(10),
  }),
  calculateAsFloat: z.boolean(),
})

export const baseCalculationResultSchema = z.strictObject({
  usedWeight: z.number(),
  loadCapacity: z.number(),
  watt: z.number(),
  health: z.number(),
  regenerationPercent: z.number(),
  speed: z.number(),
  cooldown: z.number(),
  range: z.number(),
  minimumRange: z.number(),
  splashRadius: z.number(),
  sight: z.number(),
  damage: z.number(),
  damagePerHealthPercent: z.number(),
  armorPierce: z.number(),
  armor: z.number(),
  attackTargets: z.strictObject({
    ground: z.boolean(),
    air: z.boolean(),
  }),
})

export type PartReinforcement = z.infer<typeof partReinforcementSchema>
export type AssemblyPartIds = z.infer<typeof assemblyPartIdsSchema>
export type BaseCalculationInput = z.infer<typeof baseCalculationInputSchema>
export type BaseCalculationResult = z.infer<typeof baseCalculationResultSchema>
