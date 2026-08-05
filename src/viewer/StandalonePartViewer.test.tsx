import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { LocalResourceIndex, type LocalResourceFile } from '../gx/local-files.ts'
import type { LoadedModel } from '../gx/model-pipeline.ts'
import { StandalonePartViewer } from './StandalonePartViewer.tsx'

const supported = { supported: true, mobile: false, reason: null }
const pcOnly = {
  supported: false,
  mobile: true,
  reason: '3D 모델 미리보기는 PC에서 사용할 수 있습니다.',
}

function resourceIndex(name = 'legs1_rdrn.gx') {
  const file = new File(['gx'], name, { lastModified: 12 })
  const entry: LocalResourceFile = {
    name,
    relativePath: name,
    size: file.size,
    lastModified: file.lastModified,
    source: 'directory-input',
    getFile: async () => file,
  }
  return new LocalResourceIndex([entry])
}

function loadedModel(cacheStatus: 'hit' | 'miss' = 'miss'): LoadedModel {
  return {
    cacheStatus,
    glb: new ArrayBuffer(16),
    fingerprint: {
      sourceId: 'legs1_rdrn.gx',
      size: 2,
      lastModified: 12,
      parserVersion: '1',
      dependencySignature: 'none',
    },
    metadata: {
      formatVersion: 1,
      parserVersion: '1',
      sourceName: 'legs1_rdrn.gx',
      meshCount: 1,
      frameCount: 0,
      animationNames: [],
      textureReferences: [],
      missingTextures: [],
      diagnostics: [],
    },
  }
}

describe('부품 단독 3D 뷰어', () => {
  it('변환 진행 상태와 캐시 결과를 표시하고 장면 준비를 알린다', async () => {
    const user = userEvent.setup()
    const terminate = vi.fn()
    const onStateChange = vi.fn()
    const loadModel = vi.fn(async (options) => {
      options.onProgress?.('converting-glb')
      return loadedModel('miss')
    })
    const result = render(
      <StandalonePartViewer
        kind="leg"
        partId={1}
        partName="로드런너"
        index={resourceIndex()}
        resetToken={3}
        capabilityOverride={supported}
        workerFactory={() => ({ terminate } as never)}
        loadModel={loadModel}
        onStateChange={onStateChange}
        renderScene={({ onReady, resetToken, label }) => (
          <button type="button" onClick={onReady}>
            {label} · reset {resetToken}
          </button>
        )}
      />,
    )

    expect(await screen.findByText('CACHE MISS')).toBeVisible()
    expect(screen.getByRole('button', { name: '로드런너 3D 모델 · reset 3' }))
      .toBeVisible()
    await user.click(screen.getByRole('button'))
    expect(await screen.findByText('로드런너 모델 준비됨')).toBeVisible()
    expect(onStateChange).toHaveBeenLastCalledWith({
      status: 'ready',
      message: '로드런너 모델 준비됨',
      cacheStatus: 'miss',
    })

    result.unmount()
    expect(terminate).toHaveBeenCalledTimes(1)
  })

  it('매핑 파일 누락과 모바일 차단 상태에서는 변환을 시작하지 않는다', async () => {
    const loadModel = vi.fn(async () => loadedModel())
    const { rerender } = render(
      <StandalonePartViewer
        kind="leg"
        partId={1}
        partName="로드런너"
        index={resourceIndex('unrelated.gx')}
        resetToken={0}
        capabilityOverride={supported}
        loadModel={loadModel}
      />,
    )
    expect(await screen.findByText(/legs1_rdrn\.gx 파일을 찾지 못했습니다/))
      .toBeVisible()

    rerender(
      <StandalonePartViewer
        kind="leg"
        partId={1}
        partName="로드런너"
        index={resourceIndex()}
        resetToken={0}
        capabilityOverride={pcOnly}
        loadModel={loadModel}
      />,
    )
    await waitFor(() => {
      expect(screen.getByText('3D 모델 미리보기는 PC에서 사용할 수 있습니다.'))
        .toBeVisible()
    })
    expect(loadModel).not.toHaveBeenCalled()
  })
})
