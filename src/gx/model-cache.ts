import { openDB, type DBSchema, type IDBPDatabase } from 'idb'

import type {
  GlbConversionMetadata,
  GlbConversionResult,
} from './glb-converter.ts'
import type { PartSocketMetadata } from './socket-assembly.ts'

const DATABASE_VERSION = 1
const CACHE_SCHEMA_VERSION = 1

export interface ModelSourceFingerprint {
  readonly sourceId: string
  readonly size: number
  readonly lastModified: number
  readonly parserVersion: string
  readonly dependencySignature: string
}

export interface CachedModel {
  readonly key: string
  readonly fingerprint: ModelSourceFingerprint
  readonly glb: ArrayBuffer
  readonly metadata: GlbConversionMetadata
  readonly socketMetadata?: PartSocketMetadata
  readonly byteSize: number
  readonly createdAt: string
  readonly lastAccessedAt: string
}

interface CachedModelRecord {
  key: string
  sourceId: string
  size: number
  lastModified: number
  parserVersion: string
  dependencySignature: string
  glb: ArrayBuffer
  metadata: GlbConversionMetadata
  socketMetadata?: PartSocketMetadata
  byteSize: number
  createdAt: string
  lastAccessedAt: string
}

interface NovaModelCacheDatabase extends DBSchema {
  models: {
    key: string
    value: CachedModelRecord
    indexes: {
      'by-source-id': string
      'by-last-accessed-at': string
    }
  }
}

export interface ModelCacheStats {
  readonly entryCount: number
  readonly totalBytes: number
  readonly oldestAccessedAt: string | null
  readonly newestAccessedAt: string | null
}

export interface ModelCacheRepository {
  get(fingerprint: ModelSourceFingerprint): Promise<CachedModel | null>
  findLatest(sourceName: string, parserVersion: string): Promise<CachedModel | null>
  put(
    fingerprint: ModelSourceFingerprint,
    result: GlbConversionResult,
    socketMetadata?: PartSocketMetadata,
  ): Promise<CachedModel>
  delete(fingerprint: ModelSourceFingerprint): Promise<void>
  clear(): Promise<void>
  stats(): Promise<ModelCacheStats>
}

function normalizeSourceId(value: string) {
  const normalized = value
    .replaceAll('\\', '/')
    .replace(/\/+/g, '/')
    .normalize('NFC')
    .toLowerCase()
  if (normalized.length === 0 || normalized.includes('../')) {
    throw new Error(`올바르지 않은 모델 소스 식별자입니다: ${value}`)
  }
  return normalized
}

function validateFingerprint(fingerprint: ModelSourceFingerprint) {
  if (
    !Number.isSafeInteger(fingerprint.size) ||
    fingerprint.size < 0 ||
    !Number.isSafeInteger(fingerprint.lastModified) ||
    fingerprint.lastModified < 0 ||
    fingerprint.parserVersion.length === 0
    || fingerprint.dependencySignature.length === 0
  ) {
    throw new Error('올바르지 않은 모델 캐시 소스 정보입니다.')
  }
}

export function buildModelCacheKey(fingerprint: ModelSourceFingerprint) {
  validateFingerprint(fingerprint)
  return [
    `gx-model-v${CACHE_SCHEMA_VERSION}`,
    encodeURIComponent(normalizeSourceId(fingerprint.sourceId)),
    fingerprint.size,
    fingerprint.lastModified,
    encodeURIComponent(fingerprint.parserVersion),
    encodeURIComponent(fingerprint.dependencySignature),
  ].join(':')
}

function cachedModelFromRecord(record: CachedModelRecord): CachedModel {
  return {
    key: record.key,
    fingerprint: {
      sourceId: record.sourceId,
      size: record.size,
      lastModified: record.lastModified,
      parserVersion: record.parserVersion,
      dependencySignature: record.dependencySignature,
    },
    glb: record.glb,
    metadata: record.metadata,
    socketMetadata: record.socketMetadata,
    byteSize: record.byteSize,
    createdAt: record.createdAt,
    lastAccessedAt: record.lastAccessedAt,
  }
}

export function createModelCacheRepository(
  databaseName = 'nova-parts-calculator-model-cache',
  now: () => string = () => new Date().toISOString(),
): ModelCacheRepository {
  let databasePromise: Promise<IDBPDatabase<NovaModelCacheDatabase>> | undefined
  const getDatabase = () => {
    databasePromise ??= openDB<NovaModelCacheDatabase>(
      databaseName,
      DATABASE_VERSION,
      {
        upgrade(database) {
          const store = database.createObjectStore('models', { keyPath: 'key' })
          store.createIndex('by-source-id', 'sourceId')
          store.createIndex('by-last-accessed-at', 'lastAccessedAt')
        },
      },
    )
    return databasePromise
  }

  return {
    async get(fingerprint) {
      const database = await getDatabase()
      const key = buildModelCacheKey(fingerprint)
      const transaction = database.transaction('models', 'readwrite')
      const record = await transaction.store.get(key)
      if (!record) {
        await transaction.done
        return null
      }
      record.lastAccessedAt = now()
      await transaction.store.put(record)
      await transaction.done
      return cachedModelFromRecord(record)
    },

    async findLatest(sourceName, parserVersion) {
      const database = await getDatabase()
      const normalizedName = sourceName.normalize('NFC').toLowerCase()
      const transaction = database.transaction('models', 'readwrite')
      const records = await transaction.store.getAll()
      const record = records
        .filter((candidate) =>
          candidate.parserVersion === parserVersion
          && candidate.metadata.sourceName.normalize('NFC').toLowerCase() === normalizedName,
        )
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0]
      if (!record) {
        await transaction.done
        return null
      }
      record.lastAccessedAt = now()
      await transaction.store.put(record)
      await transaction.done
      return cachedModelFromRecord(record)
    },

    async put(fingerprint, result, socketMetadata) {
      const database = await getDatabase()
      const sourceId = normalizeSourceId(fingerprint.sourceId)
      const normalizedFingerprint = { ...fingerprint, sourceId }
      const key = buildModelCacheKey(normalizedFingerprint)
      const timestamp = now()
      const transaction = database.transaction('models', 'readwrite')
      const oldKeys = await transaction.store.index('by-source-id').getAllKeys(sourceId)
      await Promise.all(
        oldKeys.filter((oldKey) => oldKey !== key).map((oldKey) => transaction.store.delete(oldKey)),
      )
      const existing = await transaction.store.get(key)
      const record: CachedModelRecord = {
        key,
        sourceId,
        size: fingerprint.size,
        lastModified: fingerprint.lastModified,
        parserVersion: fingerprint.parserVersion,
        dependencySignature: fingerprint.dependencySignature,
        glb: result.glb,
        metadata: result.metadata,
        socketMetadata,
        byteSize: result.glb.byteLength,
        createdAt: existing?.createdAt ?? timestamp,
        lastAccessedAt: timestamp,
      }
      await transaction.store.put(record)
      await transaction.done
      return cachedModelFromRecord(record)
    },

    async delete(fingerprint) {
      const database = await getDatabase()
      await database.delete('models', buildModelCacheKey(fingerprint))
    },

    async clear() {
      const database = await getDatabase()
      await database.clear('models')
    },

    async stats() {
      const database = await getDatabase()
      const records = await database.getAll('models')
      const accessed = records.map((record) => record.lastAccessedAt).sort()
      return {
        entryCount: records.length,
        totalBytes: records.reduce((sum, record) => sum + record.byteSize, 0),
        oldestAccessedAt: accessed[0] ?? null,
        newestAccessedAt: accessed.at(-1) ?? null,
      }
    },
  }
}

export const modelCacheRepository = createModelCacheRepository()
