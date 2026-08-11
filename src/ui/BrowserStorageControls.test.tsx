import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { BrowserStorageControls } from './BrowserStorageControls.tsx'

describe('브라우저 저장 정보 삭제 UI', () => {
  it('확인 후 모든 정보를 삭제하고 새로고침한다', async () => {
    const user = userEvent.setup()
    const clearStorage = vi.fn(async () => undefined)
    const reload = vi.fn()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<BrowserStorageControls clearStorage={clearStorage} reload={reload} />)

    await user.click(screen.getByRole('button', {
      name: '브라우저 저장 정보 모두 삭제',
    }))

    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('되돌릴 수 없으며'))
    expect(clearStorage).toHaveBeenCalledOnce()
    expect(reload).toHaveBeenCalledOnce()
    expect(screen.getByRole('status')).toHaveTextContent('저장 정보를 삭제했습니다')
  })

  it('사용자가 취소하면 저장 정보를 삭제하지 않는다', async () => {
    const user = userEvent.setup()
    const clearStorage = vi.fn(async () => undefined)
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<BrowserStorageControls clearStorage={clearStorage} reload={vi.fn()} />)

    await user.click(screen.getByRole('button', {
      name: '브라우저 저장 정보 모두 삭제',
    }))

    expect(clearStorage).not.toHaveBeenCalled()
  })

  it('삭제 실패 시 새로고침하지 않고 다시 시도할 수 있게 알린다', async () => {
    const user = userEvent.setup()
    const clearStorage = vi.fn(async () => {
      throw new Error('blocked')
    })
    const reload = vi.fn()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<BrowserStorageControls clearStorage={clearStorage} reload={reload} />)

    await user.click(screen.getByRole('button', {
      name: '브라우저 저장 정보 모두 삭제',
    }))

    expect(await screen.findByRole('alert')).toHaveTextContent('일부 정보를 삭제하지 못했습니다')
    expect(reload).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.getByRole('button')).toBeEnabled())
  })
})
