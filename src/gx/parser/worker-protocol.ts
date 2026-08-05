import type {
  GxParseResult,
  XfiParseOptions,
  XfiParseResult,
} from './types.ts'
import type {
  GlbConversionResult,
  GxTextureInput,
} from '../glb-converter.ts'

export type GxParserWorkerRequest =
  | {
      readonly id: number
      readonly operation: 'parse-gx'
      readonly buffer: ArrayBuffer
    }
  | {
      readonly id: number
      readonly operation: 'parse-xfi'
      readonly text: string
      readonly options?: XfiParseOptions
    }
  | {
      readonly id: number
      readonly operation: 'convert-glb'
      readonly parsed: GxParseResult
      readonly sourceName: string
      readonly textures: readonly GxTextureInput[]
      readonly xfi?: XfiParseResult | null
      readonly animationFps?: number
    }

export type GxParserWorkerRequestPayload =
  GxParserWorkerRequest extends infer Request
    ? Request extends GxParserWorkerRequest
      ? Omit<Request, 'id'>
      : never
    : never

export type GxParserWorkerSuccess =
  | {
      readonly id: number
      readonly ok: true
      readonly operation: 'parse-gx'
      readonly result: GxParseResult
    }
  | {
      readonly id: number
      readonly ok: true
      readonly operation: 'parse-xfi'
      readonly result: XfiParseResult
    }
  | {
      readonly id: number
      readonly ok: true
      readonly operation: 'convert-glb'
      readonly result: GlbConversionResult
    }

export interface GxParserWorkerFailure {
  readonly id: number
  readonly ok: false
  readonly error: {
    readonly name: string
    readonly code: string
    readonly message: string
    readonly offset: number
  }
}

export type GxParserWorkerResponse =
  | GxParserWorkerSuccess
  | GxParserWorkerFailure
