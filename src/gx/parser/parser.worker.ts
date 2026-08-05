/// <reference lib="webworker" />

import { GxParseError } from './binary.ts'
import { convertGxToGlb } from '../glb-converter.ts'
import { parseGx } from './gx-parser.ts'
import type { GxParseResult } from './types.ts'
import type {
  GxParserWorkerFailure,
  GxParserWorkerRequest,
  GxParserWorkerResponse,
} from './worker-protocol.ts'
import { parseXfi } from './xfi-parser.ts'

function serializeError(id: number, error: unknown): GxParserWorkerFailure {
  if (error instanceof GxParseError) {
    return {
      id,
      ok: false,
      error: {
        name: error.name,
        code: error.code,
        message: error.message,
        offset: error.offset,
      },
    }
  }
  return {
    id,
    ok: false,
    error: {
      name: error instanceof Error ? error.name : 'Error',
      code: 'UNEXPECTED_GX_WORKER_ERROR',
      message: error instanceof Error ? error.message : '알 수 없는 파서 오류',
      offset: 0,
    },
  }
}

function gxTransferables(result: GxParseResult) {
  const buffers = new Set<ArrayBuffer>()
  const add = (view: ArrayBufferView<ArrayBufferLike>) => {
    if (view.buffer instanceof ArrayBuffer) buffers.add(view.buffer)
  }
  for (const frame of result.frames) {
    if (frame.keyframes) add(frame.keyframes.timelineIndices)
  }
  for (const mesh of result.meshes) {
    const geometry = mesh.geometry
    add(geometry.positions)
    add(geometry.normals)
    add(geometry.uvs)
    add(geometry.indices)
    if (geometry.metadata.variant === 'table') {
      add(geometry.metadata.table)
    }
    if (geometry.metadata.variant === 'type7') {
      add(geometry.metadata.table)
    }
    if (geometry.metadata.variant === 'sprite') {
      add(geometry.metadata.animation.timelineIndices)
      add(geometry.metadata.animation.deformationVectors)
      for (const frameUvs of geometry.metadata.animation.uvFrames) {
        add(frameUvs)
      }
    }
  }
  return [...buffers]
}

const scope = self as DedicatedWorkerGlobalScope

scope.onmessage = async (event: MessageEvent<GxParserWorkerRequest>) => {
  const request = event.data
  try {
    if (request.operation === 'parse-gx') {
      const result = parseGx(request.buffer)
      const response: GxParserWorkerResponse = {
        id: request.id,
        ok: true,
        operation: 'parse-gx',
        result,
      }
      scope.postMessage(response, gxTransferables(result))
      return
    }

    if (request.operation === 'parse-xfi') {
      const response: GxParserWorkerResponse = {
        id: request.id,
        ok: true,
        operation: 'parse-xfi',
        result: parseXfi(request.text, request.options),
      }
      scope.postMessage(response)
      return
    }

    const result = await convertGxToGlb(request.parsed, {
      sourceName: request.sourceName,
      textures: request.textures,
      xfi: request.xfi,
      animationFps: request.animationFps,
    })
    const response: GxParserWorkerResponse = {
      id: request.id,
      ok: true,
      operation: 'convert-glb',
      result,
    }
    scope.postMessage(response, [result.glb])
  } catch (error) {
    scope.postMessage(serializeError(request.id, error))
  }
}
