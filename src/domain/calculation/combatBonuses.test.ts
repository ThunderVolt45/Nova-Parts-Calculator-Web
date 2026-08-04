import { describe, expect, it } from 'vitest'

import { getAttackDefenseBase, getTeamDual } from './combatBonuses.ts'

describe('combat bonuses', () => {
  it('caps the attack and defense base bonus at 10', () => {
    expect(getAttackDefenseBase(0)).toBe(3)
    expect(getAttackDefenseBase(399)).toBe(4)
    expect(getAttackDefenseBase(2000)).toBe(10)
  })

  it('caps team dual contribution and player count', () => {
    expect(getTeamDual(0, 3)).toBe(3)
    expect(getTeamDual(1200, 12)).toBe(60)
    expect(getTeamDual(1200, 99)).toBe(60)
    expect(getTeamDual(1200, -1)).toBe(0)
  })
})
