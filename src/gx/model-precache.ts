import type { LocalResourceIndex } from './local-files.ts'
import {
  loadOrBuildModel,
  type ModelPipelineWorker,
} from './model-pipeline.ts'
import type { ModelCacheRepository } from './model-cache.ts'
import { gxResourceMap } from './resource-map.ts'

export interface ModelPrecacheProgress {
  readonly completed: number
  readonly total: number
  readonly cacheHits: number
  readonly converted: number
  readonly failed: number
  readonly currentSource: string | null
}

export interface ModelPrecacheFailure {
  readonly sourceName: string
  readonly message: string
}

export interface ModelPrecacheResult extends ModelPrecacheProgress {
  readonly failures: readonly ModelPrecacheFailure[]
}

export function uniqueMappedGxSources() {
  const sources = new Map<string, string>()
  for (const mapping of gxResourceMap.items) {
    if (mapping.mappingStatus !== 'mapped' || !mapping.sourceGx) continue
    const key = mapping.sourceGx.normalize('NFC').toLowerCase()
    if (!sources.has(key)) sources.set(key, mapping.sourceGx)
  }
  return [...sources.values()]
}

export async function precacheMappedModels(options: {
  readonly index: LocalResourceIndex
  readonly cache: ModelCacheRepository
  readonly worker: ModelPipelineWorker
  readonly signal?: AbortSignal
  readonly onProgress?: (progress: ModelPrecacheProgress) => void
}): Promise<ModelPrecacheResult> {
  const sources = uniqueMappedGxSources()
  const failures: ModelPrecacheFailure[] = []
  let completed = 0
  let cacheHits = 0
  let converted = 0

  const report = (currentSource: string | null) => options.onProgress?.({
    completed,
    total: sources.length,
    cacheHits,
    converted,
    failed: failures.length,
    currentSource,
  })

  report(null)
  for (const sourceName of sources) {
    if (options.signal?.aborted) break
    report(sourceName)
    const source = options.index.find(sourceName)
    if (!source) {
      failures.push({ sourceName, message: '승인된 폴더에서 GX 파일을 찾지 못했습니다.' })
      completed += 1
      continue
    }
    try {
      const model = await loadOrBuildModel({
        source,
        index: options.index,
        cache: options.cache,
        worker: options.worker,
        includeSocketMetadata: true,
      })
      if (model.cacheStatus === 'hit') cacheHits += 1
      else converted += 1
    } catch (error) {
      failures.push({
        sourceName,
        message: error instanceof Error ? error.message : 'GLB 변환에 실패했습니다.',
      })
    }
    completed += 1
    report(sourceName)
  }

  return {
    completed,
    total: sources.length,
    cacheHits,
    converted,
    failed: failures.length,
    currentSource: null,
    failures,
  }
}
