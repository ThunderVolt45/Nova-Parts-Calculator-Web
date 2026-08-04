import { z } from 'zod'

import { partsCatalog, partsCatalogById } from '../data/catalog/catalog.ts'
import {
  DECK_SCHEMA_VERSION,
  createDeck,
  deckSchema,
  savedUnitSchema,
  type Deck,
  type SavedUnit,
} from '../domain/deck/schema.ts'
import {
  assertDecksContainOnlyValidUnits,
  assertSavedUnitIsValid,
} from './unitValidation.ts'

const exportKindSchema = z.enum(['unit', 'deck', 'backup'])

export const deckExportSchema = z
  .strictObject({
    format: z.literal('nova-parts-deck'),
    schemaVersion: z.literal(DECK_SCHEMA_VERSION),
    catalogVersion: z.string().min(1),
    exportedAt: z.iso.datetime(),
    kind: exportKindSchema,
    decks: z.array(deckSchema),
    unit: savedUnitSchema.nullable(),
  })
  .superRefine((value, context) => {
    if (value.kind === 'unit' && value.unit === null) {
      context.addIssue({
        code: 'custom',
        path: ['unit'],
        message: '현재 유닛 내보내기에는 unit이 필요합니다.',
      })
    }
    if (value.kind !== 'unit' && value.decks.length === 0) {
      context.addIssue({
        code: 'custom',
        path: ['decks'],
        message: '덱 내보내기에는 하나 이상의 덱이 필요합니다.',
      })
    }
  })

const legacyDeckExportSchema = z.strictObject({
  format: z.literal('nova-parts-deck'),
  schemaVersion: z.literal(0),
  catalogVersion: z.string().min(1),
  exportedAt: z.iso.datetime(),
  decks: z.array(deckSchema),
})

export type DeckExport = z.infer<typeof deckExportSchema>

export type ImportResult = {
  data: DeckExport
  decks: Deck[]
  unit: SavedUnit | null
  warnings: string[]
}

export function createUnitExport(unit: SavedUnit): DeckExport {
  return deckExportSchema.parse({
    ...createExportBase(),
    kind: 'unit',
    decks: [],
    unit,
  })
}

export function createDeckExport(deck: Deck): DeckExport {
  return deckExportSchema.parse({
    ...createExportBase(),
    kind: 'deck',
    decks: [deck],
    unit: null,
  })
}

export function createBackupExport(decks: Deck[]): DeckExport {
  return deckExportSchema.parse({
    ...createExportBase(),
    kind: 'backup',
    decks,
    unit: null,
  })
}

export function serializeDeckExport(value: DeckExport) {
  return `${JSON.stringify(deckExportSchema.parse(value), null, 2)}\n`
}

export function parseDeckImport(text: string): ImportResult {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error('JSON 문법이 올바르지 않습니다.')
  }

  const migrated = migrateDeckExport(json)
  const data = deckExportSchema.parse(migrated)
  const warnings: string[] = []

  if (data.catalogVersion !== partsCatalog.catalogVersion) {
    warnings.push(
      `카탈로그 버전이 다릅니다: ${data.catalogVersion} → ${partsCatalog.catalogVersion}`,
    )
  }

  let decks = data.decks.map((deck) => sanitizeDeckCatalogIds(deck, warnings))
  let unit: SavedUnit | null = null
  if (data.kind === 'unit' && data.unit) {
    unit = sanitizeUnitCatalogIds(data.unit, '현재 유닛', warnings)
    assertSavedUnitIsValid(unit, '현재 유닛')
    const deck = createDeck('가져온 유닛', partsCatalog.catalogVersion)
    deck.slots[0] = unit
    decks = [{ ...deck, updatedAt: new Date().toISOString() }]
  } else {
    assertDecksContainOnlyValidUnits(decks)
  }

  return { data, decks, unit, warnings }
}

export function migrateDeckExport(value: unknown): unknown {
  if (!isRecord(value)) return value

  if (value.schemaVersion === 0) {
    const legacy = legacyDeckExportSchema.parse(value)
    return {
      ...legacy,
      schemaVersion: DECK_SCHEMA_VERSION,
      kind: legacy.decks.length === 1 ? 'deck' : 'backup',
      unit: null,
    }
  }

  return value
}

function createExportBase() {
  return {
    format: 'nova-parts-deck' as const,
    schemaVersion: DECK_SCHEMA_VERSION,
    catalogVersion: partsCatalog.catalogVersion,
    exportedAt: new Date().toISOString(),
  }
}

function sanitizeDeckCatalogIds(deck: Deck, warnings: string[]) {
  const slots = deck.slots.map((unit, index) =>
    unit ? sanitizeUnitCatalogIds(unit, `${deck.name} ${index + 1}번 슬롯`, warnings) : null,
  )

  return deckSchema.parse({ ...deck, slots })
}

function sanitizeUnitCatalogIds(
  unit: SavedUnit,
  location: string,
  warnings: string[],
): SavedUnit {
  const partIds = { ...unit.partIds }
  const subcoreIds = { ...unit.subcoreIds }
  const partMaps = {
    leg: partsCatalogById.legs,
    body: partsCatalogById.bodies,
    weapon: partsCatalogById.weapons,
    accessory: partsCatalogById.accessories,
  } as const

  for (const slot of ['leg', 'body', 'weapon', 'accessory'] as const) {
    if (!partMaps[slot].has(partIds[slot])) {
      warnings.push(`${location}: 알 수 없는 ${slot} ID ${partIds[slot]}를 0으로 복구했습니다.`)
      partIds[slot] = 0
    }
  }

  const fallbackSubcoreId = partsCatalog.subcores[0]?.id ?? 0
  for (const slot of ['leg', 'body', 'weapon'] as const) {
    if (!partsCatalogById.subcores.has(subcoreIds[slot])) {
      warnings.push(
        `${location}: 알 수 없는 ${slot} 서브코어 ID ${subcoreIds[slot]}를 ${fallbackSubcoreId}(으)로 복구했습니다.`,
      )
      subcoreIds[slot] = fallbackSubcoreId
    }
  }

  return savedUnitSchema.parse({ ...unit, partIds, subcoreIds })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
