import type {
  GxParseResult,
  XfiParseOptions,
  XfiParseResult,
} from './types.ts'
import type {
  GlbConversionResult,
  GxTextureInput,
} from '../glb-converter.ts'
import type {
  GxParserWorkerRequestPayload,
  GxParserWorkerResponse,
} from './worker-protocol.ts'

interface PendingRequest<T> {
  readonly resolve: (value: T) => void
  readonly reject: (reason: unknown) => void
}

export class GxParserWorkerError extends Error {
  readonly code: string
  readonly offset: number

  constructor(
    code: string,
    message: string,
    offset: number,
  ) {
    super(message)
    this.name = 'GxParserWorkerError'
    this.code = code
    this.offset = offset
  }
}

export class GxParserWorkerClient {
  readonly #worker: Worker
  readonly #pending = new Map<number, PendingRequest<unknown>>()
  #nextId = 1

  constructor(
    worker = new Worker(new URL('./parser.worker.ts', import.meta.url), {
      type: 'module',
      name: 'nova-gx-parser',
    }),
  ) {
    this.#worker = worker
    this.#worker.onmessage = (event: MessageEvent<GxParserWorkerResponse>) => {
      const response = event.data
      const pending = this.#pending.get(response.id)
      if (!pending) return
      this.#pending.delete(response.id)
      if (response.ok) pending.resolve(response.result)
      else {
        pending.reject(
          new GxParserWorkerError(
            response.error.code,
            response.error.message,
            response.error.offset,
          ),
        )
      }
    }
    this.#worker.onerror = (event) => {
      const error = new GxParserWorkerError(
        'WORKER_ERROR',
        event.message || 'GX 파서 Worker 오류',
        0,
      )
      for (const pending of this.#pending.values()) pending.reject(error)
      this.#pending.clear()
    }
  }

  parseGx(buffer: ArrayBuffer) {
    return this.#request<GxParseResult>(
      { operation: 'parse-gx', buffer },
      [buffer],
    )
  }

  async parseGxFile(file: Blob) {
    return this.parseGx(await file.arrayBuffer())
  }

  parseXfi(text: string, options?: XfiParseOptions) {
    return this.#request<XfiParseResult>({
      operation: 'parse-xfi',
      text,
      options,
    })
  }

  async parseXfiFile(file: Blob, options?: XfiParseOptions) {
    return this.parseXfi(await file.text(), options)
  }

  convertGlb(
    parsed: GxParseResult,
    options: {
      readonly sourceName: string
      readonly textures?: readonly GxTextureInput[]
      readonly xfi?: XfiParseResult | null
      readonly animationFps?: number
    },
  ) {
    const textures = options.textures ?? []
    return this.#request<GlbConversionResult>(
      {
        operation: 'convert-glb',
        parsed,
        sourceName: options.sourceName,
        textures,
        xfi: options.xfi,
        animationFps: options.animationFps,
      },
      collectConversionTransferables(parsed, textures),
    )
  }

  terminate() {
    this.#worker.terminate()
    const error = new GxParserWorkerError(
      'WORKER_TERMINATED',
      'GX 파서 Worker가 종료되었습니다.',
      0,
    )
    for (const pending of this.#pending.values()) pending.reject(error)
    this.#pending.clear()
  }

  #request<T>(
    request: GxParserWorkerRequestPayload,
    transfer: Transferable[] = [],
  ) {
    const id = this.#nextId
    this.#nextId += 1
    return new Promise<T>((resolve, reject) => {
      this.#pending.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
      })
      this.#worker.postMessage({ ...request, id }, transfer)
    })
  }
}

function collectConversionTransferables(
  parsed: GxParseResult,
  textures: readonly GxTextureInput[],
) {
  const buffers = new Set<ArrayBuffer>()
  const add = (view: ArrayBufferView<ArrayBufferLike>) => {
    if (view.buffer instanceof ArrayBuffer) buffers.add(view.buffer)
  }
  for (const frame of parsed.frames) {
    if (frame.keyframes) add(frame.keyframes.timelineIndices)
  }
  for (const mesh of parsed.meshes) {
    const geometry = mesh.geometry
    add(geometry.positions)
    add(geometry.normals)
    add(geometry.uvs)
    add(geometry.indices)
    if (geometry.metadata.variant === 'table' || geometry.metadata.variant === 'type7') {
      add(geometry.metadata.table)
    }
    if (geometry.metadata.variant === 'sprite') {
      add(geometry.metadata.animation.timelineIndices)
      add(geometry.metadata.animation.deformationVectors)
      for (const uvs of geometry.metadata.animation.uvFrames) add(uvs)
    }
  }
  for (const texture of textures) buffers.add(texture.buffer)
  return [...buffers]
}
