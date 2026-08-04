import type { CalculationCatalog } from './calculateBaseStats.ts'
import { calculateBaseStats } from './calculateBaseStats.ts'
import { getAttackDefenseBase, getTeamDual } from './combatBonuses.ts'
import type {
  BaseCalculationInput,
  BaseCalculationResult,
} from './schema.ts'
import type {
  FinalCalculationResult,
  SimulationInput,
} from './simulationSchema.ts'

function requireCatalogItem<T>(
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

export function calculateFinalStats(
  base: BaseCalculationResult,
  baseInput: BaseCalculationInput,
  simulation: SimulationInput,
  catalog: CalculationCatalog,
): FinalCalculationResult {
  const body = requireCatalogItem(catalog.bodies, baseInput.partIds.body, 'body')
  const weapon = requireCatalogItem(
    catalog.weapons,
    baseInput.partIds.weapon,
    'weapon',
  )
  const accessory = requireCatalogItem(
    catalog.accessories,
    baseInput.partIds.accessory,
    'accessory',
  )
  const watt = Math.trunc(base.watt)

  let health = Math.trunc(base.health)
  if (simulation.statuses.towering) {
    if (accessory.toweringEffect === 'enhanced') {
      health = Math.trunc((health * 3) / 2)
    } else if (accessory.toweringEffect === 'standard') {
      health *= 2
    }
  }

  const canAttack = base.attackTargets.ground || base.attackTargets.air
  let damage: number | null = canAttack ? Math.trunc(base.damage) : null
  if (damage !== null) {
    const halfDamage = Math.trunc(damage / 2)
    const damage30 = Math.trunc((damage * 30) / 100)

    if (
      simulation.statuses.bodyLowHealthEffect &&
      body.lowHealthEffect === 'damage-plus-50-percent'
    ) {
      damage += halfDamage
    }

    if (simulation.statuses.weaponEffect) {
      if (weapon.weaponEffect === 'damage-plus-50-percent') {
        damage += halfDamage
      } else if (weapon.weaponEffect === 'damage-plus-30-percent') {
        damage += damage30
      } else if (weapon.weaponEffect === 'damage-divided-by-3') {
        damage = Math.trunc(damage / 3)
      }
    }

    if (simulation.skills.despera) {
      damage += halfDamage
    }
    if (simulation.skills.devilSpirit) {
      damage += halfDamage
    }

    if (simulation.statuses.towering) {
      if (accessory.toweringEffect === 'enhanced') {
        damage = Math.trunc((damage * 3) / 2)
      } else if (accessory.toweringEffect === 'standard') {
        damage *= 2
      }
    }

    if (simulation.skills.attackBase) {
      damage += getAttackDefenseBase(watt)
    }
    damage += getTeamDual(watt, simulation.skills.teamDualPlayers)
    if (simulation.skills.groundAirAttack) {
      damage += 15
    }
    if (simulation.skills.morale) {
      damage += 20
    }
    damage += 3 * simulation.skills.teamAttackPlayers
    damage += 50 * simulation.squareFormation.damageUnits
    if (simulation.statuses.deathmatch) {
      damage *= 2
    }
  }

  let armor = Math.trunc(base.armor)
  if (
    simulation.statuses.bodyLowHealthEffect &&
    body.lowHealthEffect === 'armor-plus-40'
  ) {
    armor += 40
  }
  if (
    simulation.statuses.weaponEffect &&
    weapon.weaponEffect === 'armor-plus-25'
  ) {
    armor += 25
  }
  if (
    simulation.statuses.towering &&
    accessory.toweringEffect !== 'none'
  ) {
    armor += 20
  }
  if (simulation.skills.defenseBase) {
    armor += getAttackDefenseBase(watt)
  }
  if (simulation.skills.groundAirDefense) {
    armor += 15
  }
  if (simulation.skills.morale) {
    armor += 20
  }
  armor += getTeamDual(watt, simulation.skills.teamDualPlayers)
  armor += Math.trunc((simulation.skills.sacrifyWatt * 3) / 100)
  armor += 3 * simulation.skills.teamDefensePlayers

  let sight = Math.trunc(base.sight)
  if (simulation.skills.groundAirSight) {
    sight += 9
  }
  sight = Math.min(30, sight)

  let range = Math.trunc(base.range)
  if (simulation.statuses.towering) {
    if (accessory.toweringEffect === 'enhanced') {
      range -= 2
    } else if (accessory.toweringEffect === 'standard') {
      range += 3
    }
  }
  range = Math.max(base.minimumRange, range)

  let speed = Math.trunc(base.speed)
  if (simulation.skills.groundAirSpeed) {
    speed += 20
  }
  if (
    simulation.statuses.weaponEffect &&
    weapon.weaponEffect === 'speed-plus-30'
  ) {
    speed += 30
  }
  speed += 20 * simulation.squareFormation.speedUnits
  speed = Math.min(120, speed)

  let cooldown = Math.trunc(base.cooldown)
  if (
    simulation.statuses.towering &&
    accessory.toweringEffect === 'enhanced'
  ) {
    cooldown -= 50
  }
  if (simulation.skills.groundAirCooldown) {
    cooldown -= 50
  }
  cooldown -= 100 * simulation.squareFormation.cooldownUnits
  cooldown = Math.max(50, cooldown)

  const healAmount =
    damage !== null && damage > 0 && weapon.healPercent !== 0
      ? Math.trunc((damage * weapon.healPercent) / 100)
      : 0
  const regenerationAmount =
    health > 0 && base.regenerationPercent !== 0
      ? Math.trunc((health * base.regenerationPercent) / 100)
      : 0

  return {
    health,
    damage,
    armor,
    speed,
    cooldown,
    sight,
    range,
    minimumRange: base.minimumRange,
    healAmount,
    regenerationAmount,
  }
}

export function calculateAssemblyStats(
  baseInput: BaseCalculationInput,
  simulation: SimulationInput,
  catalog: CalculationCatalog,
) {
  const base = calculateBaseStats(baseInput, catalog)
  const final = calculateFinalStats(base, baseInput, simulation, catalog)
  return { base, final }
}
