import { describe, expect, it } from 'vitest'

import { DECK_SLOT_COUNT, createDeck, deckSchema } from './schema.ts'

describe('덱 도메인', () => {
  it('새 덱을 정확히 10개의 빈 슬롯으로 만든다', () => {
    const deck = createDeck('ALPHA', 'catalog-1', {
      id: 'deck-1',
      now: '2026-08-04T00:00:00.000Z',
    })

    expect(deck.slots).toHaveLength(DECK_SLOT_COUNT)
    expect(deck.slots.every((slot) => slot === null)).toBe(true)
    expect(deckSchema.parse(deck)).toEqual(deck)
  })

  it('10개가 아닌 슬롯 배열을 거부한다', () => {
    const deck = createDeck('ALPHA', 'catalog-1')
    expect(() => deckSchema.parse({ ...deck, slots: deck.slots.slice(1) })).toThrow()
  })
})
