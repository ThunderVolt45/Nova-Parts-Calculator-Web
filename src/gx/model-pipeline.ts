import type {
  GlbConversionMetadata,
  GlbConversionResult,
  GxTextureInput,
} from './glb-converter.ts'
import type { LocalResourceFile, LocalResourceIndex } from './local-files.ts'
import type {
  ModelCacheRepository,
  ModelSourceFingerprint,
} from './model-cache.ts'
import { GX_PARSER_VERSION } from './parser/gx-parser.ts'
import type {
  GxParseResult,
  XfiParseResult,
} from './parser/types.ts'
import {
  describePartSockets,
  type PartSocketMetadata,
} from './socket-assembly.ts'

const MODEL_CACHE_ARTIFACT_VERSION = `${GX_PARSER_VERSION}:glb-2`

export class ModelAccessError extends Error {
  readonly code: 'READ_PERMISSION_REQUIRED' | 'READ_PERMISSION_DENIED'

  constructor(
    code: ModelAccessError['code'],
    message: string,
  ) {
    super(message)
    this.name = 'ModelAccessError'
    this.code = code
  }
}

export interface ModelPipelineWorker {
  parseGxFile(file: Blob): Promise<GxParseResult>
  parseXfiFile(file: Blob): Promise<XfiParseResult>
  convertGlb(
    parsed: GxParseResult,
    options: {
      readonly sourceName: string
      readonly textures?: readonly GxTextureInput[]
      readonly xfi?: XfiParseResult | null
      readonly animationFps?: number
    },
  ): Promise<GlbConversionResult>
}

export interface LoadModelOptions {
  readonly source: LocalResourceFile
  readonly index: Pick<LocalResourceIndex, 'find' | 'findTexture' | 'hasReadPermission'>
  readonly cache: ModelCacheRepository
  readonly worker: ModelPipelineWorker
  readonly verifyReadPermission?: () => Promise<boolean>
  readonly animationFps?: number
  readonly includeSocketMetadata?: boolean
  readonly onProgress?: (stage: ModelPipelineStage) => void
}

export type ModelPipelineStage =
  | 'checking-permission'
  | 'parsing-gx'
  | 'checking-cache'
  | 'loading-resources'
  | 'converting-glb'
  | 'saving-cache'

export interface LoadedModel {
  readonly cacheStatus: 'hit' | 'miss'
  readonly fingerprint: ModelSourceFingerprint
  readonly glb: ArrayBuffer
  readonly metadata: GlbConversionMetadata
  readonly socketMetadata?: PartSocketMetadata
}

export async function loadCachedModel(
  sourceName: string,
  cache: ModelCacheRepository,
): Promise<LoadedModel | null> {
  const cached = await cache.findLatest(sourceName, MODEL_CACHE_ARTIFACT_VERSION)
  return cached
    ? cachedResult('hit', cached.fingerprint, cached, cached.socketMetadata)
    : null
}

function sidecarName(sourceName: string) {
  const dot = sourceName.lastIndexOf('.')
  return `${dot > 0 ? sourceName.slice(0, dot) : sourceName}.xfi`
}

function normalizePath(value: string) {
  return value.replaceAll('\\', '/').normalize('NFC').toLowerCase()
}

function dependencyHash(value: string) {
  let hash = 0xcbf29ce484222325n
  for (const byte of new TextEncoder().encode(value)) {
    hash ^= BigInt(byte)
    hash = BigInt.asUintN(64, hash * 0x100000001b3n)
  }
  return hash.toString(16).padStart(16, '0')
}

function dependencySignature(
  xfi: LocalResourceFile | undefined,
  textures: readonly {
    reference: string
    file: LocalResourceFile | undefined
  }[],
) {
  const entries = [
    xfi
      ? `xfi:${normalizePath(xfi.relativePath)}:${xfi.size}:${xfi.lastModified}`
      : 'xfi:missing',
    ...textures.map(({ reference, file }) => file
      ? `texture:${normalizePath(reference)}:${normalizePath(file.relativePath)}:${file.size}:${file.lastModified}`
      : `texture:${normalizePath(reference)}:missing`,
    ),
  ].sort()
  return dependencyHash(entries.join('\n'))
}

async function checkPermission(options: LoadModelOptions) {
  if (options.source.source !== 'file-system-access') return
  const verify = options.verifyReadPermission
    ?? (() => options.index.hasReadPermission(false))
  if (!(await verify())) {
    throw new ModelAccessError(
      'READ_PERMISSION_DENIED',
      '게임 폴더 읽기 권한이 없습니다. 폴더 선택 버튼으로 권한을 다시 승인하세요.',
    )
  }
}

function cachedResult(
  cacheStatus: LoadedModel['cacheStatus'],
  fingerprint: ModelSourceFingerprint,
  result: Pick<GlbConversionResult, 'glb' | 'metadata'>,
  socketMetadata?: PartSocketMetadata,
): LoadedModel {
  return {
    cacheStatus,
    fingerprint,
    glb: result.glb,
    metadata: result.metadata,
    socketMetadata,
  }
}

export async function loadOrBuildModel(
  options: LoadModelOptions,
): Promise<LoadedModel> {
  options.onProgress?.('checking-permission')
  await checkPermission(options)
  const sourceFile = await options.source.getFile()
  options.onProgress?.('parsing-gx')
  const parsed = await options.worker.parseGxFile(sourceFile)
  const textureReferences = [...new Map(
    parsed.meshes.flatMap((mesh) => mesh.texture
      ? [[normalizePath(mesh.texture), {
          reference: mesh.texture,
          impliesAlpha: mesh.textureImpliesAlpha,
        }] as const]
      : [],
    ),
  ).values()]
  const resolvedTextures = textureReferences.map((texture) => ({
    ...texture,
    file: options.index.findTexture(texture.reference, texture.impliesAlpha),
  }))
  const xfiFile = options.index.find(sidecarName(options.source.name))
  const fingerprint: ModelSourceFingerprint = {
    sourceId: `${options.source.source}:${normalizePath(options.source.relativePath)}`,
    size: sourceFile.size,
    lastModified: sourceFile.lastModified,
    parserVersion: MODEL_CACHE_ARTIFACT_VERSION,
    dependencySignature: dependencySignature(xfiFile, resolvedTextures),
  }
  options.onProgress?.('checking-cache')
  const cached = await options.cache.get(fingerprint)
  if (cached) {
    let socketMetadata = cached.socketMetadata
    if (options.includeSocketMetadata && !socketMetadata) {
      const xfi = xfiFile
        ? await options.worker.parseXfiFile(await xfiFile.getFile())
        : null
      socketMetadata = describePartSockets(parsed, xfi)
      await options.cache.put(fingerprint, cached, socketMetadata)
    }
    return cachedResult(
      'hit',
      fingerprint,
      cached,
      options.includeSocketMetadata ? socketMetadata : undefined,
    )
  }

  options.onProgress?.('loading-resources')
  const files = new Map<string, Promise<File>>()
  const buffers = new Map<string, Promise<ArrayBuffer>>()
  const textures: GxTextureInput[] = []
  for (const texture of resolvedTextures) {
    if (!texture.file) continue
    const path = normalizePath(texture.file.relativePath)
    let filePromise = files.get(path)
    if (!filePromise) {
      filePromise = texture.file.getFile()
      files.set(path, filePromise)
    }
    const file = await filePromise
    let buffer = buffers.get(path)
    if (!buffer) {
      buffer = file.arrayBuffer()
      buffers.set(path, buffer)
    }
    textures.push({
      reference: texture.reference,
      fileName: file.name,
      mimeType: file.type || undefined,
      buffer: await buffer,
    })
  }
  const xfi = xfiFile
    ? await options.worker.parseXfiFile(await xfiFile.getFile())
    : null
  options.onProgress?.('converting-glb')
  const converted = await options.worker.convertGlb(parsed, {
    sourceName: sourceFile.name,
    textures,
    xfi,
    animationFps: options.animationFps,
  })
  const socketMetadata = options.includeSocketMetadata
    ? describePartSockets(parsed, xfi)
    : undefined
  options.onProgress?.('saving-cache')
  await options.cache.put(fingerprint, converted, socketMetadata)
  return cachedResult(
    'miss',
    fingerprint,
    converted,
    socketMetadata,
  )
}
