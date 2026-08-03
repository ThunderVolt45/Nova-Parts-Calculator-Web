import { describe, expect, it } from 'vitest'

import { normalizeLegacyCatalog } from './legacyCatalog.ts'

const commonPart = {
  ID: 0,
  Name: '없음',
  N: false,
  Weight: 0,
  Watt: 0,
  Health: 0,
  HealthBonus: 0,
  Damage: 0,
  DamageBonus: 0,
  DamagePerHealth: 0,
  CanAttackGround: 'FALSE',
  CanAttackAir: 'FALSE',
  Pierce: 0,
  Speed: 0,
  Armor: 0,
  Cooldown: 0,
  Sight: 0,
  Range: 0,
  RangeMinimum: 0,
  Regenerate: 0,
  Splash: 0,
  SplashReduce: 0,
  Special: '',
}

const subcores = {
  ID: [0, 9],
  Name: ['서브코어 없음', '사지타리움'],
  Watt: [0, 0],
  WattBonus: [0, 0],
  Health: [0, 0],
  HealthBonus: [0, 0],
  Damage: [0, 0],
  DamageBonus: [0, 0],
  DamagePerHealth: [0, 0],
  Pierce: [0, 0],
  Speed: [0, 0],
  Armor: [0, 0],
  Cooldown: [0, 0],
  Sight: [0, 0],
  Range: [0, 1],
  RangeWeapon: [0, 2],
  RangeMinimum: [0, 0],
  Regenerate: [0, 0],
  Splash: [0, 0],
  SplashReduce: [0, 0],
  Special: ['서브코어 없음', '사거리 +1'],
  Sagittarius: '사거리 +2',
  SagittariusBonus: 2,
}

function makeLegacySource() {
  return {
    legs: [{ ...commonPart, Name: '다리' }],
    bodies: [
      {
        ...commonPart,
        Name: '몸통',
        __comment__: '0 : 없음',
        Type: 0,
        LowHealthEffect: 0,
      },
    ],
    weapons: [
      {
        ...commonPart,
        Name: '무기',
        __comment__: '0 : 없음',
        Type: 0,
        WeaponEffect: 0,
        HealAmount: 0,
      },
    ],
    accessories: [
      {
        ...commonPart,
        Name: '악세사리',
        Towering: 0,
        HasRandomOption: false,
      },
    ],
    subcores,
  }
}

describe('normalizeLegacyCatalog', () => {
  it('normalizes legacy names, booleans, and semantic codes', () => {
    const source = makeLegacySource()
    source.bodies[0] = {
      ...source.bodies[0],
      ID: 47,
      Name: '버서커',
      Type: 2,
      LowHealthEffect: 2,
    }
    source.weapons[0] = {
      ...source.weapons[0],
      ID: 33,
      Name: '리코일건N',
      Type: 2,
      WeaponEffect: 1,
    }
    source.accessories[0] = {
      ...source.accessories[0],
      ID: 60,
      Name: '타워링III',
      Towering: 2,
      HasRandomOption: true,
    }

    const catalog = normalizeLegacyCatalog(source, 'test-1')

    expect(catalog.parts.legs[0]?.attackTargets).toEqual({ ground: false, air: false })
    expect(catalog.parts.bodies[0]).toMatchObject({
      id: 47,
      mountType: 'arm',
      lowHealthEffect: 'damage-plus-50-percent',
    })
    expect(catalog.parts.weapons[0]).toMatchObject({
      id: 33,
      weaponEffect: 'speed-plus-30',
    })
    expect(catalog.parts.accessories[0]).toMatchObject({
      id: 60,
      toweringEffect: 'enhanced',
      hasRandomOptions: true,
    })
  })

  it('expands the columnar subcore source into slot-specific effects', () => {
    const catalog = normalizeLegacyCatalog(makeLegacySource(), 'test-1')
    const sagittarius = catalog.subcores.find((subcore) => subcore.id === 9)

    expect(sagittarius?.modifiersBySlot.leg.range).toBe(1)
    expect(sagittarius?.modifiersBySlot.body.range).toBe(1)
    expect(sagittarius?.modifiersBySlot.weapon.range).toBe(2)
    expect(sagittarius?.descriptionsBySlot.weapon).toBe('사거리 +2')
  })

  it('rejects subcore columns with different lengths', () => {
    const source = makeLegacySource()
    source.subcores = { ...source.subcores, Armor: [0] }

    expect(() => normalizeLegacyCatalog(source, 'test-1')).toThrow(
      /Expected 2 values, received 1/,
    )
  })

  it('rejects duplicate IDs within the same part category', () => {
    const source = makeLegacySource()
    source.legs.push({ ...source.legs[0] })

    expect(() => normalizeLegacyCatalog(source, 'test-1')).toThrow(/Duplicate legacy ID: 0/)
  })
})
