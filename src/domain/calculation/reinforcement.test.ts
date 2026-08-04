import { describe, expect, it } from 'vitest'

import {
  getDamageBase,
  getDamageReinforcement,
  getHealthBase,
  getHealthReinforcement,
  getWattBase,
  getWattReinforcement,
} from './reinforcement.ts'

describe('reinforcement formulas', () => {
  it('ports the watt reinforcement formula', () => {
    expect(getWattBase(155)).toBe(38.75)
    expect(getWattReinforcement(155, 33, false)).toBe(12)
    expect(getWattReinforcement(155, 33, true)).toBe(12.7875)
  })

  it('uses different health bases for bodies and other parts', () => {
    expect(getHealthBase(400, true)).toBe(150)
    expect(getHealthBase(70, false)).toBe(50)
    expect(getHealthBase(110, false)).toBe(60)
    expect(getHealthReinforcement(401, 33, true, false)).toBe(49)
  })

  it('uses different damage bases for weapons and other parts', () => {
    expect(getDamageBase(100, true)).toBe(28)
    expect(getDamageBase(60, false)).toBe(3)
    expect(getDamageBase(120, false)).toBe(4)
    expect(getDamageReinforcement(101, 33, true, false)).toBe(9)
  })
})
