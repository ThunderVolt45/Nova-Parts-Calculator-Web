import { describe, expect, it } from 'vitest'

import {
  catalogSourceRevision,
  partsCatalog,
  partsCatalogById,
} from './catalog.ts'

describe('partsCatalog', () => {
  it('loads the complete reference catalog snapshot', () => {
    expect(partsCatalog.catalogVersion).toMatch(/^1-[0-9a-f]{12}$/)
    expect(catalogSourceRevision).toMatch(/^[0-9a-f]{40}$/)
    expect(partsCatalog.parts.legs).toHaveLength(41)
    expect(partsCatalog.parts.bodies).toHaveLength(59)
    expect(partsCatalog.parts.weapons).toHaveLength(65)
    expect(partsCatalog.parts.accessories).toHaveLength(78)
    expect(partsCatalog.subcores).toHaveLength(13)
  })

  it('uses stable IDs instead of array positions for lookup', () => {
    expect(partsCatalogById.legs.get(1)).toMatchObject({
      id: 1,
      name: '로드런너',
      loadCapacity: 50,
    })
    expect(partsCatalogById.weapons.get(60)).toMatchObject({
      id: 60,
      name: '아포칼립스',
    })
  })

  it('preserves negative modifiers from the source data', () => {
    expect(
      partsCatalog.parts.accessories.some(
        (part) => part.stats.health < 0 || part.stats.watt < 0,
      ),
    ).toBe(true)
    expect(partsCatalog.parts.legs.some((part) => part.stats.armor < 0)).toBe(true)
  })

  it('applies the Sagittarius weapon-slot override', () => {
    const sagittarius = partsCatalogById.subcores.get(9)

    expect(sagittarius?.modifiersBySlot.leg.range).toBe(1)
    expect(sagittarius?.modifiersBySlot.body.range).toBe(1)
    expect(sagittarius?.modifiersBySlot.weapon.range).toBe(2)
    expect(sagittarius?.descriptionsBySlot.weapon).toBe('사거리 +2')
  })
})
