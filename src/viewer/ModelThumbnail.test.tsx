import { act, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { LocalResourceIndex, type LocalResourceFile } from '../gx/local-files.ts'
import type { LoadedModel } from '../gx/model-pipeline.ts'
import type { GxMatrix } from '../gx/parser/types.ts'
import { PartModelThumbnail, UnitModelThumbnail } from './ModelThumbnail.tsx'

const supported = { supported: true, mobile: false, reason: null }
const identity: GxMatrix = [
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
]

function resourceIndex(names: readonly string[]) {
  return new LocalResourceIndex(names.map((name): LocalResourceFile => {
    const file = new File(['gx'], name, { lastModified: 1 })
    return {
      name,
      relativePath: name,
      size: file.size,
      lastModified: file.lastModified,
      source: 'directory-input',
      getFile: async () => file,
    }
  }))
}

function loaded(sourceName: string): LoadedModel {
  const isLeg = sourceName.startsWith('legs')
  const isBody = sourceName.startsWith('body')
  return {
    cacheStatus: 'miss',
    glb: new ArrayBuffer(16),
    fingerprint: {
      sourceId: sourceName,
      size: 2,
      lastModified: 1,
      parserVersion: '1',
      dependencySignature: 'none',
    },
    metadata: {
      formatVersion: 1,
      parserVersion: '1',
      sourceName,
      meshCount: 1,
      frameCount: 0,
      animationNames: [],
      textureReferences: [],
      missingTextures: [],
      diagnostics: [],
    },
    socketMetadata: {
      primaryFrameName: isLeg ? 'legs' : isBody ? 'body' : 'arm',
      primaryFrameTransform: identity,
      xfi: isLeg
        ? { partType: 0, sockets: [identity] }
        : isBody
          ? { partType: 1, sockets: [identity, identity, identity, identity, identity] }
          : null,
    },
  }
}

describe('부품·덱 3D 썸네일', () => {
  it('GX 폴더와 저장된 캐시가 없으면 지정된 모델링 정보 안내를 표시한다', async () => {
    render(
      <PartModelThumbnail
        kind="leg"
        partId={1}
        partName="로드런너"
        index={null}
        capabilityOverride={supported}
      />,
    )

    expect(await screen.findByLabelText(
      '모델링 정보 없음 - 프리뷰 기능을 이용하려면 GX 파일을 불러와야 합니다.',
    )).toBeVisible()
  })

  it('부품 GLB를 렌더링한 썸네일 이미지로 교체한다', async () => {
    const renderThumbnail = vi.fn(async () => 'data:image/png;base64,cGFydA==')
    const onStateChange = vi.fn()
    render(
      <PartModelThumbnail
        kind="leg"
        partId={1}
        partName="로드런너"
        index={resourceIndex(['legs1_rdrn.gx'])}
        capabilityOverride={supported}
        workerFactory={() => ({ terminate: vi.fn() } as never)}
        loadModel={async (options) => loaded(options.source.name)}
        renderThumbnail={renderThumbnail}
        onStateChange={onStateChange}
      />,
    )

    expect(await screen.findByAltText('로드런너 3D 프리뷰')).toHaveAttribute(
      'src',
      'data:image/png;base64,cGFydA==',
    )
    expect(renderThumbnail).toHaveBeenCalledTimes(1)
    expect(onStateChange).toHaveBeenLastCalledWith({
      status: 'ready',
      url: 'data:image/png;base64,cGFydA==',
    })
  })

  it('선택 창이 닫혀도 진행 중인 변환은 완료하고 썸네일 렌더링은 취소한다', async () => {
    const terminate = vi.fn()
    const renderThumbnail = vi.fn(async () => 'data:image/png;base64,cGFydA==')
    let finishLoad: ((model: LoadedModel) => void) | undefined
    const loadModel = vi.fn(() => new Promise<LoadedModel>((resolve) => {
      finishLoad = resolve
    }))
    const result = render(
      <PartModelThumbnail
        kind="leg"
        partId={1}
        partName="로드런너"
        index={resourceIndex(['legs1_rdrn.gx'])}
        capabilityOverride={supported}
        workerFactory={() => ({ terminate } as never)}
        loadModel={loadModel}
        renderThumbnail={renderThumbnail}
      />,
    )

    await vi.waitFor(() => expect(loadModel).toHaveBeenCalledTimes(1))
    result.unmount()
    expect(terminate).not.toHaveBeenCalled()
    await act(async () => finishLoad!(loaded('legs1_rdrn.gx')))
    await vi.waitFor(() => expect(terminate).toHaveBeenCalledTimes(1))
    expect(renderThumbnail).not.toHaveBeenCalled()
  })

  it('덱 유닛의 세 GLB와 소켓 변환으로 조립 썸네일을 만든다', async () => {
    const loadModel = vi.fn(async (options) => loaded(options.source.name))
    const renderThumbnail = vi.fn(async () => 'data:image/png;base64,dW5pdA==')
    const onStateChange = vi.fn()
    render(
      <UnitModelThumbnail
        parts={{ leg: 1, body: 1, weapon: 1 }}
        name="테스트 유닛"
        index={resourceIndex(['legs1_rdrn.gx', 'body4_kpr.gx', 'arm5_dmsz.gx'])}
        capabilityOverride={supported}
        workerFactory={() => ({ terminate: vi.fn() } as never)}
        loadModel={loadModel}
        renderThumbnail={renderThumbnail}
        onStateChange={onStateChange}
      />,
    )

    expect(await screen.findByAltText('테스트 유닛 3D 프리뷰')).toBeVisible()
    expect(loadModel).toHaveBeenCalledTimes(3)
    expect(renderThumbnail).toHaveBeenCalledWith(expect.objectContaining({
      legsGlb: expect.any(ArrayBuffer),
      bodyGlb: expect.any(ArrayBuffer),
      weaponGlb: expect.any(ArrayBuffer),
    }))
    expect(onStateChange).toHaveBeenLastCalledWith({
      status: 'ready',
      url: 'data:image/png;base64,dW5pdA==',
    })
  })
})
