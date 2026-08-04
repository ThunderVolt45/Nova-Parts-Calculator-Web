import { describe, expect, it } from 'vitest'

import { partsCatalog } from '../data/catalog/catalog.ts'
import { createDeck, type SavedUnit } from '../domain/deck/schema.ts'
import { createBackupExport, parseDeckImport, serializeDeckExport } from './transfer.ts'

function createUnit(): SavedUnit {
  const body = partsCatalog.parts.bodies.find((part) => part.id !== 0)!
  const weapon = partsCatalog.parts.weapons.find(
    (part) => part.id !== 0 && part.mountType === body.mountType,
  )!
  const leg = partsCatalog.parts.legs.find(
    (part) => part.id !== 0 && part.loadCapacity >= body.weight + weapon.weight,
  )!

  return {
    name: '테스트 유닛',
    schemaVersion: 1,
    catalogVersion: partsCatalog.catalogVersion,
    partIds: { leg: leg.id, body: body.id, weapon: weapon.id, accessory: 0 },
    subcoreIds: { leg: 0, body: 0, weapon: 0 },
    reinforcement: {
      leg: { watt: 0, health: 0, damage: 0 },
      body: { watt: 0, health: 0, damage: 0 },
      weapon: { watt: 0, health: 0, damage: 0 },
    },
    accessoryRandomOptions: { health: 0, damage: 0, armor: 0 },
  }
}

describe('덱 JSON 가져오기와 내보내기', () => {
  it('백업 JSON을 왕복한다', () => {
    const deck = createDeck('ALPHA', partsCatalog.catalogVersion, { id: 'deck-1' })
    deck.slots[0] = createUnit()
    const exported = createBackupExport([deck])

    const imported = parseDeckImport(serializeDeckExport(exported))

    expect(imported.decks).toEqual([deck])
    expect(imported.unit).toBeNull()
    expect(imported.warnings).toEqual([])
  })

  it('알 수 없는 부품 ID로 유효하지 않게 된 덱을 거부한다', () => {
    const deck = createDeck('ALPHA', partsCatalog.catalogVersion, { id: 'deck-1' })
    deck.slots[0] = { ...createUnit(), partIds: { ...createUnit().partIds, weapon: 999999 } }

    expect(() =>
      parseDeckImport(serializeDeckExport(createBackupExport([deck]))),
    ).toThrow(/유효하지 않은 유닛 조합/)
  })

  it('형식에 맞지 않는 수치를 거부한다', () => {
    const deck = createDeck('ALPHA', partsCatalog.catalogVersion, { id: 'deck-1' })
    deck.slots[0] = {
      ...createUnit(),
      reinforcement: {
        ...createUnit().reinforcement,
        weapon: { watt: 0, health: 0, damage: 101 },
      },
    }

    expect(() => createBackupExport([deck])).toThrow()
  })
})
