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
    const loadModel = vi.fn(async (options) => loaded(options.source.name))
    const result = render(
      <AssembledUnitViewer
        parts={parts}
        mountCompatible
        index={resourceIndex()}
        resetToken={4}
        animation={{ clip: 'move', playing: false, restartToken: 2 }}
        capabilityOverride={supported}
        workerFactory={() => ({ terminate } as never)}
        loadModel={loadModel}
        onStateChange={onStateChange}
        onAnimationClipsChange={onAnimationClipsChange}
        renderScene={({
          onReady,
          label,
          resetToken,
          animation,
          onAnimationClipsChange,
        }) => (
          <button type="button" onClick={() => {
            onAnimationClipsChange?.(['idle', 'move', 'attack'])
            onReady()
          }}>
            {label} · reset {resetToken} · {animation?.clip}
          </button>
        )}
      />,
    )

    expect(await screen.findByText('CACHE HIT ×3')).toBeVisible()
    expect(loadModel).toHaveBeenCalledTimes(3)
    for (const [options] of loadModel.mock.calls) {
      expect(options.includeSocketMetadata).toBe(true)
    }
    await user.click(screen.getByRole('button', { name: /조립 유닛 3D 모델/ }))
    expect(onAnimationClipsChange).toHaveBeenCalledWith(['idle', 'move', 'attack'])
    expect(await screen.findByText('3부품 소켓 조립 완료')).toBeVisible()
    expect(onStateChange).toHaveBeenLastCalledWith({
      status: 'ready',
      message: '3부품 소켓 조립 완료',
      cacheStatus: 'hit',
      warning: undefined,
    })

    result.unmount()
    expect(terminate).toHaveBeenCalledTimes(1)
  })

  it('타입 불일치도 진단용으로 표시하면서 조립 불가를 함께 알린다', async () => {
    const user = userEvent.setup()
    render(
      <AssembledUnitViewer
        parts={parts}
        mountCompatible={false}
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

    expect(screen.getByRole('alert')).toHaveTextContent('조립 불가')
    await user.click(await screen.findByRole('button', { name: '장면 준비' }))
    expect(await screen.findByText('진단용 3D 조립 표시 중')).toBeVisible()
  })

  it('한 부품의 GX 파일이 누락되어도 나머지 모델로 프리뷰를 만든다', async () => {
    const user = userEvent.setup()
    const loadModel = vi.fn(async (options) => loaded(options.source.name))
    render(
      <AssembledUnitViewer
        parts={parts}
        mountCompatible
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

    expect(await screen.findByText('CACHE HIT ×2')).toBeVisible()
    await waitFor(() => expect(loadModel).toHaveBeenCalledTimes(2))
    expect(await screen.findByRole('alert')).toHaveTextContent('무기 누락')
    await user.click(screen.getByRole('button', { name: '부분 장면 준비' }))
    expect(await screen.findByText('일부 부품만 진단용으로 표시 중')).toBeVisible()
  })
})
