import { describe, expect, it } from 'vitest'

import type { XfiParseResult } from './types.ts'
import type {
  GxParserWorkerRequest,
  GxParserWorkerResponse,
} from './worker-protocol.ts'
import { GxParserWorkerClient } from './worker-client.ts'

class FakeWorker {
  onmessage: ((event: MessageEvent<GxParserWorkerResponse>) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  readonly messages: Array<{
    request: GxParserWorkerRequest
    transfer: Transferable[]
  }> = []
  terminated = false

  postMessage(request: GxParserWorkerRequest, transfer: Transferable[] = []) {
    this.messages.push({ request, transfer })
  }

  terminate() {
    this.terminated = true
  }

  respond(response: GxParserWorkerResponse) {
    this.onmessage?.({ data: response } as MessageEvent<GxParserWorkerResponse>)
  }

  fail(message: string) {
    this.onerror?.({ message } as ErrorEvent)
  }
}

const xfiResult: XfiParseResult = {
  partType: 0,
  matrices: [],
  animationRanges: [],
  diagnostics: [],
}

describe('GX 파서 Worker 클라이언트', () => {
  it('요청 ID로 동시에 진행 중인 응답을 연결한다', async () => {
    const worker = new FakeWorker()
    const client = new GxParserWorkerClient(worker as unknown as Worker)
    const first = client.parseXfi('0,')
    const second = client.parseXfi('1,')

    expect(worker.messages.map(({ request }) => request.id)).toEqual([1, 2])
    worker.respond({
      id: 2,
      ok: true,
      operation: 'parse-xfi',
      result: { ...xfiResult, partType: 1 },
    })
    worker.respond({
      id: 1,
      ok: true,
      operation: 'parse-xfi',
      result: xfiResult,
    })

    await expect(first).resolves.toEqual(xfiResult)
    await expect(second).resolves.toMatchObject({ partType: 1 })
  })

  it('GX ArrayBuffer를 복사 없이 Worker 전송 목록에 넣는다', () => {
    const worker = new FakeWorker()
    const client = new GxParserWorkerClient(worker as unknown as Worker)
    const buffer = new ArrayBuffer(16)

    void client.parseGx(buffer)

    expect(worker.messages[0]).toMatchObject({
      request: { id: 1, operation: 'parse-gx', buffer },
      transfer: [buffer],
    })
  })

  it('파싱 결과와 텍스처 버퍼를 GLB 변환 Worker로 이전한다', async () => {
    const worker = new FakeWorker()
    const client = new GxParserWorkerClient(worker as unknown as Worker)
    const positions = new Float32Array([0, 0, 0])
    const texture = new ArrayBuffer(8)
    const parsed = {
      parserVersion: '1',
      byteLength: 1,
      chunkCount: 1,
      frames: [],
      diagnostics: [],
      meshes: [{
        index: 0,
        name: 'mesh',
        frameIndex: null,
        frameName: null,
        texture: null,
        textureImpliesAlpha: false,
        materialImpliesAlpha: false,
        usesBlackBlendTexture: false,
        requiresAlpha: false,
        material: null,
        transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] as const,
        geometry: {
          positions,
          normals: new Float32Array([0, 1, 0]),
          uvs: new Float32Array([0, 0]),
          indices: new Uint32Array([0]),
          sourceIndexBase: 0 as const,
          metadata: { variant: 'standard' as const, unknown0: 0, unknown1: 0 },
        },
      }],
    }
    const pending = client.convertGlb(parsed, {
      sourceName: 'part.gx',
      textures: [{ reference: 'part.bmp', fileName: 'part.tga', buffer: texture }],
    })

    expect(worker.messages[0].request).toMatchObject({
      operation: 'convert-glb',
      sourceName: 'part.gx',
    })
    expect(worker.messages[0].transfer).toEqual(expect.arrayContaining([positions.buffer, texture]))
    const result = {
      glb: new ArrayBuffer(12),
      metadata: {
        formatVersion: 1 as const,
        parserVersion: '1',
        sourceName: 'part.gx',
        meshCount: 1,
        frameCount: 0,
        animationNames: [],
        textureReferences: [],
        missingTextures: [],
        diagnostics: [],
      },
    }
    worker.respond({
      id: 1,
      ok: true,
      operation: 'convert-glb',
      result,
    })
    await expect(pending).resolves.toEqual(result)
  })

  it('Worker 파싱 오류의 코드와 위치를 보존한다', async () => {
    const worker = new FakeWorker()
    const client = new GxParserWorkerClient(worker as unknown as Worker)
    const result = client.parseXfi('broken')

    worker.respond({
      id: 1,
      ok: false,
      error: {
        name: 'GxParseError',
        code: 'INVALID_XFI_TYPE',
        message: '잘못된 타입',
        offset: 7,
      },
    })

    await expect(result).rejects.toMatchObject({
      code: 'INVALID_XFI_TYPE',
      message: '잘못된 타입',
      offset: 7,
    })
  })

  it('Worker 오류와 명시적 종료 시 대기 중 요청을 모두 거부한다', async () => {
    const failedWorker = new FakeWorker()
    const failedClient = new GxParserWorkerClient(failedWorker as unknown as Worker)
    const failed = failedClient.parseXfi('0,')
    failedWorker.fail('작업자 실패')

    await expect(failed).rejects.toMatchObject({
      code: 'WORKER_ERROR',
      message: '작업자 실패',
    })

    const terminatedWorker = new FakeWorker()
    const terminatedClient = new GxParserWorkerClient(
      terminatedWorker as unknown as Worker,
    )
    const terminated = terminatedClient.parseXfi('0,')
    terminatedClient.terminate()

    expect(terminatedWorker.terminated).toBe(true)
    await expect(terminated).rejects.toMatchObject({
      code: 'WORKER_TERMINATED',
    })
  })
})
