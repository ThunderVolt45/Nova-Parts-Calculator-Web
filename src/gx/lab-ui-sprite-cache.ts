import { openDB, type DBSchema, type IDBPDatabase } from 'idb'

import type { LabUiSpriteKey } from './lab-ui-atlas.ts'

const DATABASE_VERSION = 1
export const LAB_UI_SPRITE_CACHE_VERSION = '1'

export interface LabUiSpriteSourceFingerprint {
  readonly sourceId: string
  readonly size: number
  readonly lastModified: number
  readonly extractorVersion: string
}

interface CachedLabUiSpriteRecord {
  key: string
  sourceId: string
  size: number
  lastModified: number
  extractorVersion: string
  sprites: Partial<Record<LabUiSpriteKey, ArrayBuffer>>
  byteSize: number
  createdAt: string
  lastAccessedAt: string
}

interface LabUiSpriteCacheDatabase extends DBSchema {
  atlases: {
    key: string
    value: CachedLabUiSpriteRecord
    indexes: {
      'by-last-accessed-at': string
    }
  }
}

export interface LabUiSpriteCacheStats {
  readonly entryCount: number
  readonly totalBytes: number
}

export interface LabUiSpriteCacheRepository {
  get(
    fingerprint: LabUiSpriteSourceFingerprint,
  ): Promise<ReadonlyMap<LabUiSpriteKey, Blob> | null>
  findLatest(
    extractorVersion: string,
  ): Promise<ReadonlyMap<LabUiSpriteKey, Blob> | null>
  put(
    fingerprint: LabUiSpriteSourceFingerprint,
    sprites: ReadonlyMap<LabUiSpriteKey, Blob>,
  ): Promise<void>
  clear(): Promise<void>
  stats(): Promise<LabUiSpriteCacheStats>
}

function normalizeSourceId(value: string) {
  const normalized = value
    .replaceAll('\\', '/')
    .replace(/\/+/g, '/')
    .normalize('NFC')
    .toLowerCase()
  if (normalized.length === 0 || normalized.includes('../')) {
    throw new Error(`올바르지 않은 스프라이트 소스 식별자입니다: ${value}`)
  }
  return normalized
}

function buildCacheKey(fingerprint: LabUiSpriteSourceFingerprint) {
  if (
    !Number.isSafeInteger(fingerprint.size)
    || fingerprint.size < 0
    || !Number.isSafeInteger(fingerprint.lastModified)
    || fingerprint.lastModified < 0
    || fingerprint.extractorVersion.length === 0
  ) {
    throw new Error('올바르지 않은 스프라이트 캐시 소스 정보입니다.')
  }
  return [
    'lab-ui-sprites',
    encodeURIComponent(normalizeSourceId(fingerprint.sourceId)),
    fingerprint.size,
    fingerprint.lastModified,
    encodeURIComponent(fingerprint.extractorVersion),
  ].join(':')
}

function recordSprites(record: CachedLabUiSpriteRecord) {
  return new Map(
    (Object.entries(record.sprites) as Array<[LabUiSpriteKey, ArrayBuffer]>)
      .map(([key, bytes]) => [key, new Blob([bytes], { type: 'image/png' })]),
  )
}

export function createLabUiSpriteCacheRepository(
  databaseName = 'nova-parts-calculator-lab-ui-sprite-cache',
  now: () => string = () => new Date().toISOString(),
): LabUiSpriteCacheRepository {
  let databasePromise: Promise<IDBPDatabase<LabUiSpriteCacheDatabase>> | undefined
  const getDatabase = () => {
    databasePromise ??= openDB<LabUiSpriteCacheDatabase>(
      databaseName,
      DATABASE_VERSION,
      {
        upgrade(database) {
          const store = database.createObjectStore('atlases', { keyPath: 'key' })
          store.createIndex('by-last-accessed-at', 'lastAccessedAt')
        },
      },
    )
    return databasePromise
  }

  async function read(record: CachedLabUiSpriteRecord | undefined) {
    if (!record) return null
    const database = await getDatabase()
    record.lastAccessedAt = now()
    await database.put('atlases', record)
    return recordSprites(record)
  }

  return {
    async get(fingerprint) {
      const database = await getDatabase()
      return read(await database.get('atlases', buildCacheKey(fingerprint)))
    },

    async findLatest(extractorVersion) {
      const database = await getDatabase()
      const records = await database.getAll('atlases')
      const latest = records
        .filter((record) => record.extractorVersion === extractorVersion)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0]
      return read(latest)
    },

    async put(fingerprint, sprites) {
      const database = await getDatabase()
      const timestamp = now()
      const values = Object.fromEntries(await Promise.all(
        [...sprites].map(async ([key, sprite]) => [key, await sprite.arrayBuffer()]),
      )) as Partial<Record<LabUiSpriteKey, ArrayBuffer>>
      const transaction = database.transaction('atlases', 'readwrite')
      await transaction.store.clear()
      await transaction.store.put({
        key: buildCacheKey(fingerprint),
        sourceId: normalizeSourceId(fingerprint.sourceId),
        size: fingerprint.size,
        lastModified: fingerprint.lastModified,
        extractorVersion: fingerprint.extractorVersion,
        sprites: values,
        byteSize: Object.values(values).reduce(
          (sum, bytes) => sum + (bytes?.byteLength ?? 0),
          0,
        ),
        createdAt: timestamp,
        lastAccessedAt: timestamp,
      })
      await transaction.done
    },

    async clear() {
      const database = await getDatabase()
      await database.clear('atlases')
    },

    async stats() {
      const database = await getDatabase()
      const records = await database.getAll('atlases')
      return {
        entryCount: records.reduce(
          (sum, record) => sum + Object.keys(record.sprites).length,
          0,
        ),
        totalBytes: records.reduce((sum, record) => sum + record.byteSize, 0),
      }
    },
  }
}

export const labUiSpriteCacheRepository = createLabUiSpriteCacheRepository()
