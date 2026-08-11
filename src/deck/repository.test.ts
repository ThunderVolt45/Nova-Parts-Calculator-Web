import 'fake-indexeddb/auto'

import { describe, expect, it } from 'vitest'

import { createDeck } from '../domain/deck/schema.ts'
import { createDeckRepository } from './repository.ts'

describe('IndexedDB 덱 저장소', () => {
  it('덱과 마지막 선택 위치를 저장하고 복원한다', async () => {
    const databaseName = `deck-test-${crypto.randomUUID()}`
    const repository = createDeckRepository(databaseName)
    const deck = createDeck('BRAVO', 'catalog-1', { id: 'deck-1' })

    await repository.saveDeck(deck)
    await repository.savePreferences({ activeDeckId: deck.id, activeSlot: 7 })

    expect(await repository.listDecks()).toEqual([deck])
    expect(await repository.loadPreferences()).toEqual({
      activeDeckId: deck.id,
      activeSlot: 7,
    })
  })

  it('전체 교체 시 기존 덱을 제거한다', async () => {
    const databaseName = `deck-test-${crypto.randomUUID()}`
    const repository = createDeckRepository(databaseName)
    await repository.saveDeck(createDeck('OLD', 'catalog-1', { id: 'old' }))
    const replacement = createDeck('NEW', 'catalog-1', { id: 'new' })

    await repository.replaceDecks([replacement])

    expect(await repository.listDecks()).toEqual([replacement])
  })

  it('덱과 마지막 선택 위치를 모두 삭제한다', async () => {
    const databaseName = `deck-test-${crypto.randomUUID()}`
    const repository = createDeckRepository(databaseName)
    const deck = createDeck('DELETE', 'catalog-1', { id: 'delete' })
    await repository.saveDeck(deck)
    await repository.savePreferences({ activeDeckId: deck.id, activeSlot: 3 })

    await repository.clear()

    expect(await repository.listDecks()).toEqual([])
    expect(await repository.loadPreferences()).toBeNull()
  })
})
