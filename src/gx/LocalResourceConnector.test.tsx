import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { LocalResourceConnector } from './LocalResourceConnector.tsx'

describe('로컬 GX 폴더 연결 UI', () => {
  it('폴더 업로드 폴백을 명시적인 사용자 선택 뒤에만 인덱싱한다', async () => {
    const user = userEvent.setup()
    const onIndexChange = vi.fn()
    render(
      <LocalResourceConnector index={null} onIndexChange={onIndexChange} />,
    )

    expect(onIndexChange).not.toHaveBeenCalled()
    expect(screen.getByText(/파일은 서버로 전송되지 않습니다/)).toBeVisible()
    expect(screen.queryByRole('button', { name: '읽기 전용 폴더 선택' }))
      .not.toBeInTheDocument()
    expect(screen.getByText('common 폴더 선택')).toBeVisible()
    expect(screen.getByText(String.raw`C:\Program Files (x86)\Nova1492\datan\common`))
      .toBeVisible()

    const file = new File(['gx'], 'legs1_rdrn.gx')
    Object.defineProperty(file, 'webkitRelativePath', {
      value: 'common/legs1_rdrn.gx',
    })
    await user.upload(screen.getByLabelText('Nova 1492 common 폴더'), file)

    expect(onIndexChange).toHaveBeenCalledTimes(1)
    expect(onIndexChange.mock.calls[0][0].find('LEGS1_RDRN.GX')).toBeDefined()
  })

  it('모델 캐시 크기를 표시하고 확인 뒤 전체 삭제한다', async () => {
    const user = userEvent.setup()
    const clear = vi.fn(async () => undefined)
    const stats = vi
      .fn()
      .mockResolvedValueOnce({
        entryCount: 2,
        totalBytes: 1536,
        oldestAccessedAt: null,
        newestAccessedAt: null,
      })
      .mockResolvedValueOnce({
        entryCount: 0,
        totalBytes: 0,
        oldestAccessedAt: null,
        newestAccessedAt: null,
      })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(
      <LocalResourceConnector
        index={null}
        onIndexChange={vi.fn()}
        cache={{ stats, clear }}
        spriteCache={{
          stats: vi.fn(async () => ({ entryCount: 15, totalBytes: 512 })),
          clear: vi.fn(async () => undefined),
        }}
      />,
    )

    expect(await screen.findByText('리소스 캐시 17개 · 2.0 KB')).toBeVisible()
    await user.click(screen.getByRole('button', { name: '전체 삭제' }))

    expect(clear).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.getByText('리소스 캐시 15개 · 512 B')).toBeVisible())
  })

  it('GLB 캐시로 프리뷰가 준비되면 연결 전에도 우하단의 축소 상태를 사용한다', async () => {
    const { container } = render(
      <LocalResourceConnector
        index={null}
        onIndexChange={vi.fn()}
        compact
        cache={{
          stats: vi.fn(async () => ({
            entryCount: 1,
            totalBytes: 1024,
            oldestAccessedAt: null,
            newestAccessedAt: null,
          })),
          clear: vi.fn(async () => undefined),
        }}
        spriteCache={{
          stats: vi.fn(async () => ({ entryCount: 0, totalBytes: 0 })),
          clear: vi.fn(async () => undefined),
        }}
      />,
    )

    expect(container.firstElementChild).toHaveClass('is-ready')
    expect(screen.getByText('저장된 3D 캐시 사용 중')).toBeVisible()
  })
})
