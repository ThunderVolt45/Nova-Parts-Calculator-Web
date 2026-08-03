import { z } from 'zod'

const integerSchema = z.number().int()
const nonNegativeIntegerSchema = integerSchema.nonnegative()

export const partSlotSchema = z.enum(['leg', 'body', 'weapon'])
export const mountTypeSchema = z.enum(['none', 'tower', 'arm', 'shoulder'])

export const statModifiersSchema = z.strictObject({
  watt: integerSchema,
  wattPercent: integerSchema,
  health: integerSchema,
  healthPercent: integerSchema,
  damage: integerSchema,
  damagePercent: integerSchema,
  damagePerHealthPercent: integerSchema,
  armorPierce: integerSchema,
  speed: integerSchema,
  armor: integerSchema,
  cooldown: integerSchema,
  sight: integerSchema,
  range: integerSchema,
  minimumRange: integerSchema,
  regenerationPercent: integerSchema,
  splashRadius: integerSchema,
  splashDamageReductionPercent: integerSchema,
})

const attackTargetsSchema = z.strictObject({
  ground: z.boolean(),
  air: z.boolean(),
})

const partBaseShape = {
  id: nonNegativeIntegerSchema,
  name: z.string().min(1),
  isNPart: z.boolean(),
  attackTargets: attackTargetsSchema,
  stats: statModifiersSchema,
  special: z.string(),
}

export const legPartSchema = z.strictObject({
  ...partBaseShape,
  kind: z.literal('leg'),
  loadCapacity: nonNegativeIntegerSchema,
})

export const lowHealthEffectSchema = z.enum([
  'none',
  'armor-plus-40',
  'damage-plus-50-percent',
])

export const bodyPartSchema = z.strictObject({
  ...partBaseShape,
  kind: z.literal('body'),
  mountType: mountTypeSchema,
  weight: nonNegativeIntegerSchema,
  lowHealthEffect: lowHealthEffectSchema,
})

export const weaponEffectSchema = z.enum([
  'none',
  'speed-plus-30',
  'armor-plus-25',
  'damage-plus-50-percent',
  'damage-plus-30-percent',
  'damage-divided-by-3',
])

export const weaponPartSchema = z.strictObject({
  ...partBaseShape,
  kind: z.literal('weapon'),
  mountType: mountTypeSchema,
  weight: nonNegativeIntegerSchema,
  weaponEffect: weaponEffectSchema,
  healPercent: nonNegativeIntegerSchema,
})

export const toweringEffectSchema = z.enum(['none', 'standard', 'enhanced'])

export const accessoryPartSchema = z.strictObject({
  ...partBaseShape,
  kind: z.literal('accessory'),
  weight: nonNegativeIntegerSchema,
  toweringEffect: toweringEffectSchema,
  hasRandomOptions: z.boolean(),
})

export const partSchema = z.discriminatedUnion('kind', [
  legPartSchema,
  bodyPartSchema,
  weaponPartSchema,
  accessoryPartSchema,
])

export const subcoreSchema = z.strictObject({
  id: nonNegativeIntegerSchema,
  name: z.string().min(1),
  modifiersBySlot: z.strictObject({
    leg: statModifiersSchema,
    body: statModifiersSchema,
    weapon: statModifiersSchema,
  }),
  descriptionsBySlot: z.strictObject({
    leg: z.string(),
    body: z.string(),
    weapon: z.string(),
  }),
})

function reportDuplicateIds(
  items: ReadonlyArray<{ id: number }>,
  path: ReadonlyArray<PropertyKey>,
  context: z.RefinementCtx,
) {
  const seen = new Set<number>()

  items.forEach((item, index) => {
    if (seen.has(item.id)) {
      context.addIssue({
        code: 'custom',
        message: `Duplicate catalog ID: ${item.id}`,
        path: [...path, index, 'id'],
      })
    }

    seen.add(item.id)
  })
}

export const partsCatalogSchema = z
  .strictObject({
    catalogVersion: z.string().min(1),
    parts: z.strictObject({
      legs: z.array(legPartSchema),
      bodies: z.array(bodyPartSchema),
      weapons: z.array(weaponPartSchema),
      accessories: z.array(accessoryPartSchema),
    }),
    subcores: z.array(subcoreSchema),
  })
  .superRefine((catalog, context) => {
    reportDuplicateIds(catalog.parts.legs, ['parts', 'legs'], context)
    reportDuplicateIds(catalog.parts.bodies, ['parts', 'bodies'], context)
    reportDuplicateIds(catalog.parts.weapons, ['parts', 'weapons'], context)
    reportDuplicateIds(catalog.parts.accessories, ['parts', 'accessories'], context)
    reportDuplicateIds(catalog.subcores, ['subcores'], context)
  })

export type PartSlot = z.infer<typeof partSlotSchema>
export type MountType = z.infer<typeof mountTypeSchema>
export type StatModifiers = z.infer<typeof statModifiersSchema>
export type LegPart = z.infer<typeof legPartSchema>
export type BodyPart = z.infer<typeof bodyPartSchema>
export type WeaponPart = z.infer<typeof weaponPartSchema>
export type AccessoryPart = z.infer<typeof accessoryPartSchema>
export type Part = z.infer<typeof partSchema>
export type Subcore = z.infer<typeof subcoreSchema>
export type PartsCatalog = z.infer<typeof partsCatalogSchema>
