import { describe, expect, it } from 'vitest'

import { partsCatalogById } from '../../data/catalog/catalog.ts'
import { getArmorPierceBreakdown } from './armorPierce.ts'

describe('getArmorPierceBreakdown', () => {
  it('keeps ordinary weapon pierce as a flat value', () => {
    const handCannon = partsCatalogById.weapons.get(16)!

    expect(getArmorPierceBreakdown(handCannon, 30)).toEqual({
      flat: 30,
      percent: null,
    })
  })

  it('extracts percent pierce from the weapon option', () => {
    const sniper = partsCatalogById.weapons.get(53)!

    expect(getArmorPierceBreakdown(sniper, 0)).toEqual({
      flat: 0,
      percent: 10,
    })
  })

  it('preserves flat pierce from other equipped options alongside percent pierce', () => {
    const sniper = partsCatalogById.weapons.get(53)!

    expect(getArmorPierceBreakdown(sniper, 7)).toEqual({
      flat: 7,
      percent: 10,
    })
  })
})
