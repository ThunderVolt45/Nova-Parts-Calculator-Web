import { describe, expect, it } from 'vitest'

import { partsCatalogById } from '../../data/catalog/catalog.ts'
import { calculateAssemblyStats } from './calculateFinalStats.ts'
import type { BaseCalculationInput } from './schema.ts'
import { emptySimulationInput } from './simulationSchema.ts'

function makeInput(weaponId = 1): BaseCalculationInput {
  return {
    partIds: { leg: 1, body: 1, weapon: weaponId, accessory: 1 },
    subcoreIds: { leg: 3, body: 7, weapon: 9 },
    reinforcement: {
      leg: { watt: 17, health: 33, damage: 49 },
      body: { watt: 65, health: 81, damage: 97 },
      weapon: { watt: 13, health: 29, damage: 45 },
    },
    accessoryRandomOptions: { health: 0, damage: 0, armor: 0 },
    calculateAsFloat: true,
  }
}

describe('calculateFinalStats', () => {
  it('truncates float-mode base values at the Python final-stat int boundaries', () => {
    const result = calculateAssemblyStats(
      makeInput(),
      emptySimulationInput,
      partsCatalogById,
    )

    expect(result.final.health).toBe(Math.trunc(result.base.health))
    expect(result.final.damage).toBe(Math.trunc(result.base.damage))
    expect(result.final.armor).toBe(Math.trunc(result.base.armor))
  })

  it('represents a non-attacking weapon with a null final damage', () => {
    const result = calculateAssemblyStats(
      makeInput(0),
      emptySimulationInput,
      partsCatalogById,
    )

    expect(result.final.damage).toBeNull()
    expect(result.final.healAmount).toBe(0)
  })

  it('keeps two thirds of Multishotgun damage when its weapon effect is active', () => {
    const input = makeInput(47)
    const simulation = {
      ...emptySimulationInput,
      statuses: {
        ...emptySimulationInput.statuses,
        weaponEffect: true,
      },
    }
    const result = calculateAssemblyStats(input, simulation, partsCatalogById)

    expect(result.final.damage).toBe(Math.trunc((result.base.damage * 2) / 3))
  })
})
