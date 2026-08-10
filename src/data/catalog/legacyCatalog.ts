import { z } from 'zod'

import {
  partsCatalogSchema,
  type MountType,
  type PartsCatalog,
  type StatModifiers,
} from '../../domain/catalog/schema.ts'

const integerSchema = z.number().int()

const legacyBooleanSchema = z
  .union([z.boolean(), z.enum(['TRUE', 'FALSE'])])
  .transform((value) => value === true || value === 'TRUE')

const legacyCommonPartShape = {
  ID: integerSchema.nonnegative(),
  Name: z.string().min(1),
  N: z.boolean(),
  Weight: integerSchema,
  Watt: integerSchema,
  Health: integerSchema,
  HealthBonus: integerSchema,
  Damage: integerSchema,
  DamageBonus: integerSchema,
  DamagePerHealth: integerSchema,
  CanAttackGround: legacyBooleanSchema,
  CanAttackAir: legacyBooleanSchema,
  Pierce: integerSchema,
  Speed: integerSchema,
  Armor: integerSchema,
  Cooldown: integerSchema,
  Sight: integerSchema,
  Range: integerSchema,
  RangeMinimum: integerSchema,
  Regenerate: integerSchema,
  Splash: integerSchema,
  SplashReduce: integerSchema,
  Special: z.string(),
}

const legacyMountTypeSchema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
])

const legacyLegSchema = z.strictObject(legacyCommonPartShape)

const legacyBodySchema = z.strictObject({
  ...legacyCommonPartShape,
  __comment__: z.string(),
  Type: legacyMountTypeSchema,
  LowHealthEffect: z.union([z.literal(0), z.literal(1), z.literal(2)]),
})

const legacyWeaponSchema = z.strictObject({
  ...legacyCommonPartShape,
  __comment__: z.string(),
  Type: legacyMountTypeSchema,
  WeaponEffect: z.union([
    z.literal(0),
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
  ]),
  HealAmount: integerSchema.nonnegative(),
})

const legacyAccessorySchema = z.strictObject({
  ...legacyCommonPartShape,
  Towering: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  HasRandomOption: z.boolean(),
})

const legacySubcoreColumnNames = [
  'ID',
  'Name',
  'Watt',
  'WattBonus',
  'Health',
  'HealthBonus',
  'Damage',
  'DamageBonus',
  'DamagePerHealth',
  'Pierce',
  'Speed',
  'Armor',
  'Cooldown',
  'Sight',
  'Range',
  'RangeWeapon',
  'RangeMinimum',
  'Regenerate',
  'Splash',
  'SplashReduce',
  'Special',
] as const

const integerArraySchema = z.array(integerSchema)

const legacySubcoreSchema = z
  .strictObject({
    ID: z.array(integerSchema.nonnegative()),
    Name: z.array(z.string().min(1)),
    Watt: integerArraySchema,
    WattBonus: integerArraySchema,
    Health: integerArraySchema,
    HealthBonus: integerArraySchema,
    Damage: integerArraySchema,
    DamageBonus: integerArraySchema,
    DamagePerHealth: integerArraySchema,
    Pierce: integerArraySchema,
    Speed: integerArraySchema,
    Armor: integerArraySchema,
    Cooldown: integerArraySchema,
    Sight: integerArraySchema,
    Range: integerArraySchema,
    RangeWeapon: integerArraySchema,
    RangeMinimum: integerArraySchema,
    Regenerate: integerArraySchema,
    Splash: integerArraySchema,
    SplashReduce: integerArraySchema,
    Special: z.array(z.string()),
    Sagittarius: z.string(),
    SagittariusBonus: integerSchema,
  })
  .superRefine((source, context) => {
    const expectedLength = source.ID.length

    for (const columnName of legacySubcoreColumnNames) {
      if (source[columnName].length !== expectedLength) {
        context.addIssue({
          code: 'custom',
          message: `Expected ${expectedLength} values, received ${source[columnName].length}`,
          path: [columnName],
        })
      }
    }
  })

const uniqueLegacyIds = <T extends z.ZodType<{ ID: number }>>(itemSchema: T) =>
  z.array(itemSchema).superRefine((items, context) => {
    const seen = new Set<number>()

    items.forEach((item, index) => {
      if (seen.has(item.ID)) {
        context.addIssue({
          code: 'custom',
          message: `Duplicate legacy ID: ${item.ID}`,
          path: [index, 'ID'],
        })
      }

      seen.add(item.ID)
    })
  })

export const legacyCatalogSourceSchema = z.strictObject({
  legs: uniqueLegacyIds(legacyLegSchema),
  bodies: uniqueLegacyIds(legacyBodySchema),
  weapons: uniqueLegacyIds(legacyWeaponSchema),
  accessories: uniqueLegacyIds(legacyAccessorySchema),
  subcores: legacySubcoreSchema,
})

export const legacyCatalogSnapshotSchema = z.strictObject({
  catalogVersion: z.string().regex(/^\d+-[0-9a-f]{12}$/),
  sourceRevision: z.string().regex(/^[0-9a-f]{40}$/),
  source: legacyCatalogSourceSchema,
})

type LegacyCommonPart = z.output<typeof legacyLegSchema>
type LegacySubcore = z.output<typeof legacySubcoreSchema>

const mountTypes: Record<0 | 1 | 2 | 3, MountType> = {
  0: 'none',
  1: 'tower',
  2: 'arm',
  3: 'shoulder',
}

function toStatModifiers(source: LegacyCommonPart): StatModifiers {
  return {
    watt: source.Watt,
    wattPercent: 0,
    health: source.Health,
    healthPercent: source.HealthBonus,
    damage: source.Damage,
    damagePercent: source.DamageBonus,
    damagePerHealthPercent: source.DamagePerHealth,
    armorPierce: source.Pierce,
    speed: source.Speed,
    armor: source.Armor,
    cooldown: source.Cooldown,
    sight: source.Sight,
    range: source.Range,
    minimumRange: source.RangeMinimum,
    regenerationPercent: source.Regenerate,
    splashRadius: source.Splash,
    splashDamageReductionPercent: source.SplashReduce,
  }
}

function toPartBase(source: LegacyCommonPart) {
  return {
    id: source.ID,
    name: source.Name,
    isNPart: source.N,
    attackTargets: {
      ground: source.CanAttackGround,
      air: source.CanAttackAir,
    },
    stats: toStatModifiers(source),
    special: source.Special,
  }
}

function toSubcoreModifiers(
  source: LegacySubcore,
  index: number,
  range: number,
): StatModifiers {
  return {
    watt: source.Watt[index]!,
    wattPercent: source.WattBonus[index]!,
    health: source.Health[index]!,
    healthPercent: source.HealthBonus[index]!,
    damage: source.Damage[index]!,
    damagePercent: source.DamageBonus[index]!,
    damagePerHealthPercent: source.DamagePerHealth[index]!,
    armorPierce: source.Pierce[index]!,
    speed: source.Speed[index]!,
    armor: source.Armor[index]!,
    cooldown: source.Cooldown[index]!,
    sight: source.Sight[index]!,
    range,
    minimumRange: source.RangeMinimum[index]!,
    regenerationPercent: source.Regenerate[index]!,
    splashRadius: source.Splash[index]!,
    splashDamageReductionPercent: source.SplashReduce[index]!,
  }
}

function normalizeSubcores(source: LegacySubcore) {
  return source.ID.map((id, index) => {
    const standardModifiers = toSubcoreModifiers(source, index, source.Range[index]!)
    const standardDescription = source.Special[index]!
    const isSagittarius = id === 9

    return {
      id,
      name: source.Name[index]!,
      modifiersBySlot: {
        leg: standardModifiers,
        body: standardModifiers,
        weapon: toSubcoreModifiers(source, index, source.RangeWeapon[index]!),
      },
      descriptionsBySlot: {
        leg: standardDescription,
        body: standardDescription,
        weapon: isSagittarius ? source.Sagittarius : standardDescription,
      },
    }
  })
}

export function normalizeLegacyCatalog(
  source: unknown,
  catalogVersion: string,
): PartsCatalog {
  const parsed = legacyCatalogSourceSchema.parse(source)

  return partsCatalogSchema.parse({
    catalogVersion,
    parts: {
      legs: parsed.legs.map((part) => ({
        ...toPartBase(part),
        kind: 'leg' as const,
        loadCapacity: part.Weight,
      })),
      bodies: parsed.bodies.map((part) => ({
        ...toPartBase(part),
        kind: 'body' as const,
        mountType: mountTypes[part.Type],
        weight: part.Weight,
        lowHealthEffect:
          part.LowHealthEffect === 1
            ? ('armor-plus-40' as const)
            : part.LowHealthEffect === 2
              ? ('damage-plus-50-percent' as const)
              : ('none' as const),
      })),
      weapons: parsed.weapons.map((part) => ({
        ...toPartBase(part),
        kind: 'weapon' as const,
        mountType: mountTypes[part.Type],
        weight: part.Weight,
        weaponEffect:
          [
            'none',
            'speed-plus-30',
            'armor-plus-25',
            'damage-plus-50-percent',
            'damage-plus-30-percent',
            'damage-times-two-thirds',
          ][part.WeaponEffect],
        healPercent: part.HealAmount,
      })),
      accessories: parsed.accessories.map((part) => ({
        ...toPartBase(part),
        kind: 'accessory' as const,
        weight: part.Weight,
        toweringEffect:
          part.Towering === 1
            ? ('standard' as const)
            : part.Towering === 2
              ? ('enhanced' as const)
              : ('none' as const),
        hasRandomOptions: part.HasRandomOption,
      })),
    },
    subcores: normalizeSubcores(parsed.subcores),
  })
}
