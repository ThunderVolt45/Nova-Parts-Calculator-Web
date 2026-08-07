import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { LocalResourceIndex, type LocalResourceFile } from '../gx/local-files.ts'
import type { LoadedModel } from '../gx/model-pipeline.ts'
import type { GxMatrix } from '../gx/parser/types.ts'
import { AssembledUnitViewer } from './AssembledUnitViewer.tsx'

const supported = { supported: true, mobile: false, reason: null }
const identity: GxMatrix = [
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
]
const parts = {
  leg: { id: 1, name: '로드런너' },
  body: { id: 1, name: '코포럴' },
  weapon: { id: 1, name: '데미시즈' },
}

function resourceIndex(names = [
  'legs1_rdrn.gx',
  'body4_kpr.gx',
  'arm5_dmsz.gx',
]) {
  return new LocalResourceIndex(names.map((name): LocalResourceFile => {
    const file = new File(['gx'], name, { lastModified: 12 })
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
    cacheStatus: 'hit',
    glb: new ArrayBuffer(16),
    fingerprint: {
      sourceId: sourceName,
      size: 2,
      lastModified: 12,
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

describe('3부품 조립 뷰어', () => {
  it('세 모델을 소켓 메타데이터와 함께 불러와 장면 준비 상태를 표시한다', async () => {
    const user = userEvent.setup()
    const terminate = vi.fn()
    const onStateChange = vi.fn()
    const onAnimationClipsChange = vi.fn()
    const onCameraStateChange = vi.fn()
    const onInteractionStart = vi.fn()
    const loadModel = vi.fn(async (options) => loaded(options.source.name))
    const result = render(
      <AssembledUnitViewer
        parts={parts}
        index={resourceIndex()}
        resetToken={4}
        animation={{ clip: 'move', playing: false, restartToken: 2 }}
        capabilityOverride={supported}
        workerFactory={() => ({ terminate } as never)}
        loadModel={loadModel}
        onStateChange={onStateChange}
        onAnimationClipsChange={onAnimationClipsChange}
        onCameraStateChange={onCameraStateChange}
        onInteractionStart={onInteractionStart}
        renderScene={({
          onReady,
          label,
          resetToken,
          animation,
          onAnimationClipsChange,
          onCameraStateChange,
          onInteractionStart,
        }) => (
          <button type="button" onClick={() => {
            onAnimationClipsChange?.(['idle', 'move', 'attack'])
            onCameraStateChange?.({
              azimuthDegrees: 34,
              polarDegrees: 68,
              zoom: 1,
            })
            onInteractionStart?.()
            onReady()
          }}>
            {label} · reset {resetToken} · {animation?.clip}
          </button>
        )}
      />,
    )

    expect(await screen.findByText('Three.js 부품 장면 준비 중…')).toBeVisible()
    expect(screen.queryByText(/CACHE HIT/)).not.toBeInTheDocument()
    expect(loadModel).toHaveBeenCalledTimes(3)
    for (const [options] of loadModel.mock.calls) {
      expect(options.includeSocketMetadata).toBe(true)
    }
    await user.click(screen.getByRole('button', { name: /조립 유닛 3D 모델/ }))
    expect(onAnimationClipsChange).toHaveBeenCalledWith(['idle', 'move', 'attack'])
    expect(onCameraStateChange).toHaveBeenCalledWith({
      azimuthDegrees: 34,
      polarDegrees: 68,
      zoom: 1,
    })
    expect(onInteractionStart).toHaveBeenCalledTimes(1)
    expect(result.container.querySelector('.model-viewer-status')).not.toBeInTheDocument()
    expect(onStateChange).toHaveBeenLastCalledWith({
      status: 'ready',
      message: '프리뷰 준비 완료',
      cacheStatus: 'hit',
    })

    result.unmount()
    expect(terminate).toHaveBeenCalledTimes(1)
  })

  it('타입 불일치 경고를 3D 프리뷰에 중복 표시하지 않는다', async () => {
    const user = userEvent.setup()
    render(
      <AssembledUnitViewer
        parts={parts}
        index={resourceIndex()}
        resetToken={0}
        capabilityOverride={supported}
        workerFactory={() => ({ terminate: vi.fn() } as never)}
        loadModel={async (options) => loaded(options.source.name)}
        renderScene={({ onReady }) => (
          <button type="button" onClick={onReady}>장면 준비</button>
        )}
      />,
    )

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: '장면 준비' }))
    expect(document.querySelector('.model-viewer-status')).not.toBeInTheDocument()
  })

  it('렌더러 오류를 프리뷰 중앙에 표시한다', async () => {
    const user = userEvent.setup()
    render(
      <AssembledUnitViewer
        parts={parts}
        index={resourceIndex()}
        resetToken={0}
        capabilityOverride={supported}
        workerFactory={() => ({ terminate: vi.fn() } as never)}
        loadModel={async (options) => loaded(options.source.name)}
        renderScene={({ onError }) => (
          <button type="button" onClick={() => onError(new Error('GLB 렌더링 실패'))}>
            오류 발생
          </button>
        )}
      />,
    )

    await user.click(await screen.findByRole('button', { name: '오류 발생' }))
    const centralMessage = await screen.findByText('GLB 렌더링 실패')
    expect(centralMessage.closest('.model-unavailable-notice')).toBeInTheDocument()
    expect(document.querySelector('.model-viewer-status')).not.toBeInTheDocument()
  })

  it('한 부품의 GX 파일이 누락되어도 나머지 모델로 프리뷰를 만든다', async () => {
    const user = userEvent.setup()
    const loadModel = vi.fn(async (options) => loaded(options.source.name))
    render(
      <AssembledUnitViewer
        parts={parts}
        index={resourceIndex(['legs1_rdrn.gx', 'body4_kpr.gx'])}
        resetToken={0}
        capabilityOverride={supported}
        loadModel={loadModel}
        workerFactory={() => ({ terminate: vi.fn() } as never)}
        renderScene={({ onReady }) => (
          <button type="button" onClick={onReady}>부분 장면 준비</button>
        )}
      />,
    )

    expect(await screen.findByText('Three.js 부품 장면 준비 중…')).toBeVisible()
    expect(screen.queryByText(/CACHE HIT/)).not.toBeInTheDocument()
    await waitFor(() => expect(loadModel).toHaveBeenCalledTimes(2))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '부분 장면 준비' }))
    expect(document.querySelector('.model-viewer-status')).not.toBeInTheDocument()
  })

  it('부품 선택과 누락 안내를 프리뷰 오버레이로 표시하지 않는다', () => {
    render(
      <AssembledUnitViewer
        parts={{
          leg: { id: 0, name: '다리 없음' },
          body: { id: 0, name: '몸통 없음' },
          weapon: { id: 0, name: '무기 없음' },
        }}
        index={resourceIndex()}
        resetToken={0}
        capabilityOverride={supported}
      />,
    )

    expect(screen.queryByText('프리뷰할 부품을 하나 이상 선택하세요.')).not.toBeInTheDocument()
    expect(document.querySelector('.model-viewer-status')).not.toBeInTheDocument()
  })
})
