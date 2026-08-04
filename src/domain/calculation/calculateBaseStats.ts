import type {
  AccessoryPart,
  BodyPart,
  LegPart,
  StatModifiers,
  Subcore,
  WeaponPart,
} from '../catalog/schema.ts'
import {
  getDamageReinforcement,
  getHealthReinforcement,
  getWattReinforcement,
} from './reinforcement.ts'
import type {
  BaseCalculationInput,
  BaseCalculationResult,
} from './schema.ts'

export interface CalculationCatalog {
  legs: ReadonlyMap<number, LegPart>
  bodies: ReadonlyMap<number, BodyPart>
  weapons: ReadonlyMap<number, WeaponPart>
  accessories: ReadonlyMap<number, AccessoryPart>
  subcores: ReadonlyMap<number, Subcore>
}

function getCatalogItem<T>(
  items: ReadonlyMap<number, T>,
  id: number,
  category: string,
): T {
  const item = items.get(id)

  if (!item) {
    throw new Error(`Unknown ${category} catalog ID: ${id}`)
  }

  return item
}

function sumModifier(
  modifiers: ReadonlyArray<StatModifiers>,
  key: keyof StatModifiers,
): number {
  return modifiers.reduce((total, stats) => total + stats[key], 0)
}

function roundLikePython(value: number, digits: number): number {
  return Number(value.toFixed(digits))
}

function finishReinforcedStat(value: number, calculateAsFloat: boolean): number {
  return calculateAsFloat ? roundLikePython(value, 4) : Math.trunc(value)
}

export function calculateBaseStats(
  input: BaseCalculationInput,
  catalog: CalculationCatalog,
): BaseCalculationResult {
  const leg = getCatalogItem(catalog.legs, input.partIds.leg, 'leg')
  const body = getCatalogItem(catalog.bodies, input.partIds.body, 'body')
  const weapon = getCatalogItem(catalog.weapons, input.partIds.weapon, 'weapon')
  const accessory = getCatalogItem(
    catalog.accessories,
    input.partIds.accessory,
    'accessory',
  )
  const legSubcore = getCatalogItem(
    catalog.subcores,
    input.subcoreIds.leg,
    'subcore',
  )
  const bodySubcore = getCatalogItem(
    catalog.subcores,
    input.subcoreIds.body,
    'subcore',
  )
  const weaponSubcore = getCatalogItem(
    catalog.subcores,
    input.subcoreIds.weapon,
    'subcore',
  )

  const partModifiers = [leg.stats, body.stats, weapon.stats, accessory.stats]
  const subcoreModifiers = [
    legSubcore.modifiersBySlot.leg,
    bodySubcore.modifiersBySlot.body,
    weaponSubcore.modifiersBySlot.weapon,
  ]
  const allModifiers = [...partModifiers, ...subcoreModifiers]
  const calculateAsFloat = input.calculateAsFloat

  let watt =
    leg.stats.watt * (1 + legSubcore.modifiersBySlot.leg.wattPercent / 100) +
    body.stats.watt * (1 + bodySubcore.modifiersBySlot.body.wattPercent / 100) +
    weapon.stats.watt *
      (1 + weaponSubcore.modifiersBySlot.weapon.wattPercent / 100) +
    accessory.stats.watt +
    sumModifier(subcoreModifiers, 'watt')
  watt -= getWattReinforcement(
    leg.stats.watt,
    input.reinforcement.leg.watt,
    calculateAsFloat,
  )
  watt -= getWattReinforcement(
    body.stats.watt,
    input.reinforcement.body.watt,
    calculateAsFloat,
  )
  watt -= getWattReinforcement(
    weapon.stats.watt,
    input.reinforcement.weapon.watt,
    calculateAsFloat,
  )
  watt = finishReinforcedStat(Math.max(0, watt), calculateAsFloat)

  let health = sumModifier(allModifiers, 'health')
  health += getHealthReinforcement(
    leg.stats.watt,
    input.reinforcement.leg.health,
    false,
    calculateAsFloat,
  )
  health += getHealthReinforcement(
    body.stats.health,
    input.reinforcement.body.health,
    true,
    calculateAsFloat,
  )
  health += getHealthReinforcement(
    weapon.stats.watt,
    input.reinforcement.weapon.health,
    false,
    calculateAsFloat,
  )
  if (accessory.hasRandomOptions) {
    health += input.accessoryRandomOptions.health
  }
  health *= 1 + sumModifier(partModifiers, 'healthPercent') / 100
  health = finishReinforcedStat(Math.max(0, health), calculateAsFloat)

  let damage = sumModifier(allModifiers, 'damage')
  damage += getDamageReinforcement(
    leg.stats.watt,
    input.reinforcement.leg.damage,
    false,
    calculateAsFloat,
  )
  damage += getDamageReinforcement(
    body.stats.watt,
    input.reinforcement.body.damage,
    false,
    calculateAsFloat,
  )
  damage += getDamageReinforcement(
    weapon.stats.damage,
    input.reinforcement.weapon.damage,
    true,
    calculateAsFloat,
  )
  if (accessory.hasRandomOptions) {
    damage += input.accessoryRandomOptions.damage
  }
  damage *= 1 + sumModifier(partModifiers, 'damagePercent') / 100
  damage = finishReinforcedStat(Math.max(0, damage), calculateAsFloat)

  let armor = sumModifier(allModifiers, 'armor')
  if (accessory.hasRandomOptions) {
    armor += input.accessoryRandomOptions.armor
  }
  armor = Math.max(0, armor)

  return {
    usedWeight: body.weight + weapon.weight + accessory.weight,
    loadCapacity: leg.loadCapacity,
    watt,
    health,
    regenerationPercent: sumModifier(allModifiers, 'regenerationPercent'),
    speed: Math.min(120, sumModifier(allModifiers, 'speed')),
    cooldown: Math.max(50, sumModifier(allModifiers, 'cooldown')),
    range: sumModifier(allModifiers, 'range'),
    minimumRange: weapon.stats.minimumRange,
    splashRadius: sumModifier(allModifiers, 'splashRadius'),
    sight: Math.min(30, sumModifier(allModifiers, 'sight')),
    damage,
    damagePerHealthPercent: sumModifier(allModifiers, 'damagePerHealthPercent'),
    armorPierce: sumModifier(allModifiers, 'armorPierce'),
    armor,
    attackTargets: weapon.attackTargets,
  }
}
