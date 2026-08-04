import { openDB, type DBSchema, type IDBPDatabase } from 'idb'

import {
  deckPreferencesSchema,
  deckSchema,
  type Deck,
  type DeckPreferences,
} from '../domain/deck/schema.ts'

const DATABASE_VERSION = 1
const PREFERENCES_KEY = 'deck-selection'

interface NovaDeckDatabase extends DBSchema {
  decks: {
    key: string
    value: Deck
    indexes: { 'by-updated-at': string }
  }
  preferences: {
    key: string
    value: DeckPreferences & { key: string }
  }
}

export interface DeckRepository {
  listDecks(): Promise<Deck[]>
  saveDeck(deck: Deck): Promise<void>
  deleteDeck(id: string): Promise<void>
  replaceDecks(decks: Deck[]): Promise<void>
  loadPreferences(): Promise<DeckPreferences | null>
  savePreferences(preferences: DeckPreferences): Promise<void>
}

export function createDeckRepository(
  databaseName = 'nova-parts-calculator',
): DeckRepository {
  let databasePromise: Promise<IDBPDatabase<NovaDeckDatabase>> | undefined

  const getDatabase = () => {
    databasePromise ??= openDB<NovaDeckDatabase>(databaseName, DATABASE_VERSION, {
      upgrade(database) {
        const deckStore = database.createObjectStore('decks', { keyPath: 'id' })
        deckStore.createIndex('by-updated-at', 'updatedAt')
        database.createObjectStore('preferences', { keyPath: 'key' })
      },
    })

    return databasePromise
  }

  return {
    async listDecks() {
      const database = await getDatabase()
      const records = await database.getAllFromIndex('decks', 'by-updated-at')
      return records
        .map((record) => deckSchema.parse(record))
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
    },

    async saveDeck(deck) {
      const database = await getDatabase()
      await database.put('decks', deckSchema.parse(deck))
    },

    async deleteDeck(id) {
      const database = await getDatabase()
      await database.delete('decks', id)
    },

    async replaceDecks(decks) {
      const database = await getDatabase()
      const transaction = database.transaction('decks', 'readwrite')
      await transaction.store.clear()
      await Promise.all(decks.map((deck) => transaction.store.put(deckSchema.parse(deck))))
      await transaction.done
    },

    async loadPreferences() {
      const database = await getDatabase()
      const record = await database.get('preferences', PREFERENCES_KEY)
      if (!record) return null

      const { key: _key, ...preferences } = record
      return deckPreferencesSchema.parse(preferences)
    },

    async savePreferences(preferences) {
      const database = await getDatabase()
      await database.put('preferences', {
        key: PREFERENCES_KEY,
        ...deckPreferencesSchema.parse(preferences),
      })
    },
  }
}
