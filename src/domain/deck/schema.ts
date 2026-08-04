import { z } from 'zod'

import { baseCalculationInputSchema } from '../calculation/schema.ts'

export const DECK_SCHEMA_VERSION = 1 as const
export const DECK_SLOT_COUNT = 10 as const

const isoDateSchema = z.iso.datetime()

export const savedUnitSchema = baseCalculationInputSchema
  .omit({ calculateAsFloat: true })
  .extend({
    name: z.string().trim().min(1).max(40),
    schemaVersion: z.literal(DECK_SCHEMA_VERSION),
    catalogVersion: z.string().min(1),
  })

const deckSlotsSchema = z
  .array(savedUnitSchema.nullable())
  .length(DECK_SLOT_COUNT)

export const deckSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(40),
  schemaVersion: z.literal(DECK_SCHEMA_VERSION),
  catalogVersion: z.string().min(1),
  slots: deckSlotsSchema,
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
})

export const deckPreferencesSchema = z.strictObject({
  activeDeckId: z.string().min(1).nullable(),
  activeSlot: z.number().int().min(0).max(DECK_SLOT_COUNT - 1),
})

export type SavedUnit = z.infer<typeof savedUnitSchema>
export type Deck = z.infer<typeof deckSchema>
export type DeckPreferences = z.infer<typeof deckPreferencesSchema>

export function createEmptySlots(): Array<SavedUnit | null> {
  return Array.from({ length: DECK_SLOT_COUNT }, () => null)
}

export function createDeck(
  name: string,
  catalogVersion: string,
  options: { id?: string; now?: string } = {},
): Deck {
  const now = options.now ?? new Date().toISOString()

  return deckSchema.parse({
    id: options.id ?? createId(),
    name,
    schemaVersion: DECK_SCHEMA_VERSION,
    catalogVersion,
    slots: createEmptySlots(),
    createdAt: now,
    updatedAt: now,
  })
}

export function copySavedUnit(unit: SavedUnit): SavedUnit {
  return savedUnitSchema.parse(structuredClone(unit))
}

function createId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }

  return `deck-${Date.now()}-${Math.random().toString(36).slice(2)}`
}
