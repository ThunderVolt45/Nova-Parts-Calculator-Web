import { z } from 'zod'

const playerCountSchema = z.number().int().min(0).max(12)
const squareUnitCountSchema = z.number().int().min(0).max(50)

export const simulationInputSchema = z.strictObject({
  statuses: z.strictObject({
    bodyLowHealthEffect: z.boolean(),
    weaponEffect: z.boolean(),
    towering: z.boolean(),
    deathmatch: z.boolean(),
  }),
  skills: z.strictObject({
    attackBase: z.boolean(),
    defenseBase: z.boolean(),
    teamDualPlayers: playerCountSchema,
    groundAirAttack: z.boolean(),
    groundAirSpeed: z.boolean(),
    groundAirCooldown: z.boolean(),
    despera: z.boolean(),
    devilSpirit: z.boolean(),
    groundAirDefense: z.boolean(),
    groundAirSight: z.boolean(),
    morale: z.boolean(),
    teamAttackPlayers: playerCountSchema,
    teamDefensePlayers: playerCountSchema,
    sacrifyWatt: z.number().int().min(0).max(2500),
  }),
  squareFormation: z.strictObject({
    damageUnits: squareUnitCountSchema,
    speedUnits: squareUnitCountSchema,
    cooldownUnits: squareUnitCountSchema,
  }),
})

export const finalCalculationResultSchema = z.strictObject({
  health: z.number(),
  damage: z.number().nullable(),
  armor: z.number(),
  speed: z.number(),
  cooldown: z.number(),
  sight: z.number(),
  range: z.number(),
  minimumRange: z.number(),
  healAmount: z.number(),
  regenerationAmount: z.number(),
})

export type SimulationInput = z.infer<typeof simulationInputSchema>
export type FinalCalculationResult = z.infer<typeof finalCalculationResultSchema>

export const emptySimulationInput: SimulationInput = {
  statuses: {
    bodyLowHealthEffect: false,
    weaponEffect: false,
    towering: false,
    deathmatch: false,
  },
  skills: {
    attackBase: false,
    defenseBase: false,
    teamDualPlayers: 0,
    groundAirAttack: false,
    groundAirSpeed: false,
    groundAirCooldown: false,
    despera: false,
    devilSpirit: false,
    groundAirDefense: false,
    groundAirSight: false,
    morale: false,
    teamAttackPlayers: 0,
    teamDefensePlayers: 0,
    sacrifyWatt: 0,
  },
  squareFormation: {
    damageUnits: 0,
    speedUnits: 0,
    cooldownUnits: 0,
  },
}
