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
  it('승인된 아틀라스의 조각 URL을 공급하고 해제한다', async () => {
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

    const result = render(
      <LabUiSpriteProvider index={index}>
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

    result.unmount()
    expect(revokeObjectURL).toHaveBeenCalledTimes(15)
  })
})
