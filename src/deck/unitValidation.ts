import { partsCatalogById } from '../data/catalog/catalog.ts'
import type { Deck, SavedUnit } from '../domain/deck/schema.ts'
import {
  assemblyValidationIssueMessages,
  validateAssembly,
} from '../domain/calculation/validateAssembly.ts'

export function getSavedUnitValidation(unit: SavedUnit) {
  try {
    const result = validateAssembly(unit.partIds, partsCatalogById)
    return {
      isValid: result.isValid,
      messages: result.issues.map((issue) => assemblyValidationIssueMessages[issue]),
    }
  } catch (error) {
    return {
      isValid: false,
      messages: [
        error instanceof Error ? error.message : '부품 정보를 확인할 수 없습니다.',
      ],
    }
  }
}

export function assertSavedUnitIsValid(unit: SavedUnit, location = unit.name) {
  const validation = getSavedUnitValidation(unit)
  if (!validation.isValid) {
    throw new Error(
      `${location}: 유효하지 않은 유닛 조합입니다. ${validation.messages.join(' ')}`,
    )
  }
}

export function assertDecksContainOnlyValidUnits(decks: Deck[]) {
  for (const deck of decks) {
    deck.slots.forEach((unit, index) => {
      if (unit) assertSavedUnitIsValid(unit, `${deck.name} ${index + 1}번 슬롯`)
    })
  }
}

export function removeInvalidUnitsFromDecks(decks: Deck[]) {
  const removed: string[] = []
  const normalized = decks.map((deck) => ({
    ...deck,
    slots: deck.slots.map((unit, index) => {
      if (!unit || getSavedUnitValidation(unit).isValid) return unit
      removed.push(`${deck.name} ${index + 1}번 슬롯`)
      return null
    }),
  }))

  return { decks: normalized as Deck[], removed }
}
