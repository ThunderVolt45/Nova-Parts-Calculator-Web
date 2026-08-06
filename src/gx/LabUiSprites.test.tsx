import { render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { LabUiSprite, LabUiSpriteProvider } from './LabUiSprites.tsx'
import { LocalResourceIndex } from './local-files.ts'

function labUiFile() {
  const bytes = new Uint8Array(24)
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10])
  bytes.set([73, 72, 68, 82], 12)
  const view = new DataView(bytes.buffer)
  view.setUint32(16, 512, false)
  view.setUint32(20, 512, false)
  return new File([bytes], 'lab_ui.png', { type: 'image/png' })
}

afterEach(() => vi.unstubAllGlobals())

describe('lab_ui 스프라이트 Provider', () => {
  it('승인된 아틀라스 조각을 캐시하고 다음 실행에는 폴더 연결 없이 공급한다', async () => {
    const file = labUiFile()
    const index = new LocalResourceIndex([
      {
        name: file.name,
        relativePath: file.name,
        size: file.size,
        lastModified: file.lastModified,
        source: 'directory-input',
        getFile: async () => file,
      },
    ])
    const close = vi.fn()
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ close })),
    )
    vi.stubGlobal(
      'OffscreenCanvas',
      class {
        getContext() {
          return { drawImage: vi.fn() }
        }

        async convertToBlob() {
          return new Blob(['sprite'], { type: 'image/png' })
        }
      },
    )
    const createObjectURL = vi.fn(
      (_blob: Blob) => `blob:sprite-${createObjectURL.mock.calls.length}`,
    )
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL })
    let cachedSprites: ReadonlyMap<import('./lab-ui-atlas.ts').LabUiSpriteKey, Blob> | null = null
    const cache = {
      get: vi.fn(async () => cachedSprites),
      findLatest: vi.fn(async () => cachedSprites),
      put: vi.fn(async (
        _fingerprint: unknown,
        sprites: ReadonlyMap<import('./lab-ui-atlas.ts').LabUiSpriteKey, Blob>,
      ) => {
        cachedSprites = new Map(sprites)
      }),
      clear: vi.fn(async () => undefined),
      stats: vi.fn(async () => ({ entryCount: cachedSprites?.size ?? 0, totalBytes: 0 })),
    }

    const result = render(
      <LabUiSpriteProvider index={index} cache={cache}>
        <LabUiSprite
          spriteKey="subcore:5"
          className="sprite"
          label="레오늄 아이콘"
          fallback={<i data-testid="fallback" />}
        />
      </LabUiSpriteProvider>,
    )

    await waitFor(() => {
      expect(result.container.querySelector('img')).toHaveAttribute(
        'src',
        'blob:sprite-8',
      )
    })
    expect(createObjectURL).toHaveBeenCalledTimes(15)
    expect(close).toHaveBeenCalledTimes(15)
    expect(cache.put).toHaveBeenCalledTimes(1)

    result.unmount()
    expect(revokeObjectURL).toHaveBeenCalledTimes(15)

    const cachedResult = render(
      <LabUiSpriteProvider index={null} cache={cache}>
        <LabUiSprite
          spriteKey="subcore:5"
          className="sprite"
          label="레오늄 아이콘"
        />
      </LabUiSpriteProvider>,
    )
    await waitFor(() => {
      expect(cachedResult.container.querySelector('img')).toHaveAttribute(
        'src',
        'blob:sprite-23',
      )
    })
    expect(cache.findLatest).toHaveBeenCalledTimes(1)
    expect(close).toHaveBeenCalledTimes(15)
  })
})
