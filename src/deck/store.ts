import { create } from 'zustand'

import { partsCatalog } from '../data/catalog/catalog.ts'
import {
  DECK_SLOT_COUNT,
  createDeck,
  deckSchema,
  savedUnitSchema,
  type Deck,
  type SavedUnit,
} from '../domain/deck/schema.ts'
import { createDeckRepository } from './repository.ts'
import {
  assertDecksContainOnlyValidUnits,
  assertSavedUnitIsValid,
  removeInvalidUnitsFromDecks,
} from './unitValidation.ts'

type DeckState = {
  decks: Deck[]
  activeDeckId: string | null
  activeSlot: number
  isHydrated: boolean
  isSaving: boolean
  error: string | null
  initialize: () => Promise<void>
  createDeck: (name: string) => Promise<void>
  duplicateDeck: () => Promise<void>
  renameDeck: (name: string) => Promise<void>
  deleteDeck: () => Promise<void>
  selectDeck: (id: string) => Promise<void>
  selectSlot: (slot: number) => Promise<void>
  saveUnit: (unit: SavedUnit) => Promise<void>
  removeUnit: () => Promise<void>
  importDecks: (decks: Deck[], mode: 'merge' | 'replace') => Promise<void>
  clearError: () => void
}

const repository = createDeckRepository()
let initializationTask: Promise<void> | null = null

function getActiveDeck(state: Pick<DeckState, 'decks' | 'activeDeckId'>) {
  return state.decks.find((deck) => deck.id === state.activeDeckId)
}

function updateDeckInList(decks: Deck[], updatedDeck: Deck) {
  return decks.map((deck) => (deck.id === updatedDeck.id ? updatedDeck : deck))
}

function withUpdatedSlot(deck: Deck, slot: number, unit: SavedUnit | null): Deck {
  const slots = [...deck.slots]
  slots[slot] = unit

  return deckSchema.parse({
    ...deck,
    catalogVersion: partsCatalog.catalogVersion,
    slots,
    updatedAt: new Date().toISOString(),
  })
}

export const useDeckStore = create<DeckState>((set, get) => {
  const persistSelection = async (activeDeckId: string | null, activeSlot: number) => {
    await repository.savePreferences({ activeDeckId, activeSlot })
  }

  const runMutation = async (mutation: () => Promise<void>) => {
    set({ isSaving: true, error: null })
    try {
      await mutation()
    } catch (error) {
      set({ error: getErrorMessage(error) })
    } finally {
      set({ isSaving: false })
    }
  }

  return {
    decks: [],
    activeDeckId: null,
    activeSlot: 0,
    isHydrated: false,
    isSaving: false,
    error: null,

    async initialize() {
      if (get().isHydrated) return

      initializationTask ??= (async () => {
        try {
          let decks = await repository.listDecks()
          const preferences = await repository.loadPreferences()
          const normalized = removeInvalidUnitsFromDecks(decks)
          decks = normalized.decks

          if (normalized.removed.length > 0) {
            await repository.replaceDecks(decks)
          }

          if (decks.length === 0) {
            const initialDeck = createDeck('ALPHA', partsCatalog.catalogVersion)
            await repository.saveDeck(initialDeck)
            decks = [initialDeck]
          }

          const activeDeckId = decks.some((deck) => deck.id === preferences?.activeDeckId)
            ? (preferences?.activeDeckId ?? decks[0].id)
            : decks[0].id
          const activeSlot = preferences?.activeSlot ?? 0

          set({
            decks,
            activeDeckId,
            activeSlot,
            isHydrated: true,
            error:
              normalized.removed.length > 0
                ? `유효하지 않은 기존 유닛 ${normalized.removed.length}개를 덱에서 제거했습니다.`
                : null,
          })
          await persistSelection(activeDeckId, activeSlot)
        } catch (error) {
          set({ isHydrated: true, error: getErrorMessage(error) })
        }
      })()

      try {
        await initializationTask
      } finally {
        initializationTask = null
      }
    },

    async createDeck(name) {
      await runMutation(async () => {
        const deck = createDeck(name, partsCatalog.catalogVersion)
        await repository.saveDeck(deck)
        await persistSelection(deck.id, 0)
        set((state) => ({ decks: [...state.decks, deck], activeDeckId: deck.id, activeSlot: 0 }))
      })
    },

    async duplicateDeck() {
      const source = getActiveDeck(get())
      if (!source) return

      await runMutation(async () => {
        const duplicate = deckSchema.parse({
          ...structuredClone(source),
          id: createDeck('복제본', partsCatalog.catalogVersion).id,
          name: `${source.name} 복사본`.slice(0, 40),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
        await repository.saveDeck(duplicate)
        await persistSelection(duplicate.id, 0)
        set((state) => ({
          decks: [...state.decks, duplicate],
          activeDeckId: duplicate.id,
          activeSlot: 0,
        }))
      })
    },

    async renameDeck(name) {
      const source = getActiveDeck(get())
      if (!source) return

      await runMutation(async () => {
        const updatedDeck = deckSchema.parse({
          ...source,
          name,
          updatedAt: new Date().toISOString(),
        })
        await repository.saveDeck(updatedDeck)
        set((state) => ({ decks: updateDeckInList(state.decks, updatedDeck) }))
      })
    },

    async deleteDeck() {
      const state = get()
      const source = getActiveDeck(state)
      if (!source) return

      await runMutation(async () => {
        await repository.deleteDeck(source.id)
        let decks = state.decks.filter((deck) => deck.id !== source.id)
        if (decks.length === 0) {
          const fallback = createDeck('ALPHA', partsCatalog.catalogVersion)
          await repository.saveDeck(fallback)
          decks = [fallback]
        }
        const activeDeckId = decks[0].id
        await persistSelection(activeDeckId, 0)
        set({ decks, activeDeckId, activeSlot: 0 })
      })
    },

    async selectDeck(id) {
      if (!get().decks.some((deck) => deck.id === id)) return
      set({ activeDeckId: id, activeSlot: 0 })
      try {
        await persistSelection(id, 0)
      } catch (error) {
        set({ error: getErrorMessage(error) })
      }
    },

    async selectSlot(slot) {
      if (slot < 0 || slot >= DECK_SLOT_COUNT) return
      const activeDeckId = get().activeDeckId
      set({ activeSlot: slot })
      try {
        await persistSelection(activeDeckId, slot)
      } catch (error) {
        set({ error: getErrorMessage(error) })
      }
    },

    async saveUnit(unit) {
      const state = get()
      const deck = getActiveDeck(state)
      if (!deck) return
      const parsedUnit = savedUnitSchema.parse(unit)
      assertSavedUnitIsValid(parsedUnit)

      await runMutation(async () => {
        const updatedDeck = withUpdatedSlot(
          deck,
          state.activeSlot,
          parsedUnit,
        )
        await repository.saveDeck(updatedDeck)
        set((current) => ({ decks: updateDeckInList(current.decks, updatedDeck) }))
      })
    },

    async removeUnit() {
      const state = get()
      const deck = getActiveDeck(state)
      if (!deck) return

      await runMutation(async () => {
        const updatedDeck = withUpdatedSlot(deck, state.activeSlot, null)
        await repository.saveDeck(updatedDeck)
        set((current) => ({ decks: updateDeckInList(current.decks, updatedDeck) }))
      })
    },

    async importDecks(importedDecks, mode) {
      await runMutation(async () => {
        const parsedDecks = importedDecks.map((deck) => deckSchema.parse(deck))
        assertDecksContainOnlyValidUnits(parsedDecks)
        const current = get().decks
        const nextDecks =
          mode === 'replace'
            ? parsedDecks
            : mergeDecks(current, parsedDecks)
        const safeDecks =
          nextDecks.length > 0
            ? nextDecks
            : [createDeck('ALPHA', partsCatalog.catalogVersion)]

        const activeDeckId =
          mode === 'merge' && parsedDecks.length > 0
            ? safeDecks[current.length]?.id ?? safeDecks[0].id
            : safeDecks[0].id
        await repository.replaceDecks(safeDecks)
        await persistSelection(activeDeckId, 0)
        set({ decks: safeDecks, activeDeckId, activeSlot: 0 })
      })
    },

    clearError() {
      set({ error: null })
    },
  }
})

function mergeDecks(current: Deck[], imported: Deck[]) {
  const usedIds = new Set(current.map((deck) => deck.id))
  const merged = [...current]

  for (const deck of imported) {
    if (!usedIds.has(deck.id)) {
      merged.push(deck)
      usedIds.add(deck.id)
      continue
    }

    const newDeck = createDeck(deck.name, deck.catalogVersion)
    merged.push({ ...deck, id: newDeck.id, name: `${deck.name} (가져옴)`.slice(0, 40) })
  }

  return merged
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : '덱 저장 중 알 수 없는 오류가 발생했습니다.'
}
