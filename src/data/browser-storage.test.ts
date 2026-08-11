import { describe, expect, it, vi } from 'vitest'

import {
  clearBrowserStorage,
  USER_GUIDE_STORAGE_KEY,
  type BrowserStorageDependencies,
} from './browser-storage.ts'

function dependencies(): BrowserStorageDependencies {
  return {
    decks: { clear: vi.fn(async () => undefined) },
    models: { clear: vi.fn(async () => undefined) },
    sprites: { clear: vi.fn(async () => undefined) },
    localStorage: { removeItem: vi.fn() },
  }
}

describe('브라우저 저장 정보 삭제', () => {
  it('덱, 모델, 스프라이트와 앱 로컬 설정을 모두 삭제한다', async () => {
    const storage = dependencies()

    await clearBrowserStorage(storage)

    expect(storage.decks.clear).toHaveBeenCalledOnce()
    expect(storage.models.clear).toHaveBeenCalledOnce()
    expect(storage.sprites.clear).toHaveBeenCalledOnce()
    expect(storage.localStorage.removeItem).toHaveBeenCalledWith(
      USER_GUIDE_STORAGE_KEY,
    )
  })

  it('한 저장소가 실패해도 나머지 저장소 삭제를 시도하고 오류를 알린다', async () => {
    const storage = dependencies()
    vi.mocked(storage.decks.clear).mockRejectedValue(new Error('blocked'))

    await expect(clearBrowserStorage(storage)).rejects.toThrow(
      '일부 브라우저 저장 정보를 삭제하지 못했습니다.',
    )
    expect(storage.models.clear).toHaveBeenCalledOnce()
    expect(storage.sprites.clear).toHaveBeenCalledOnce()
    expect(storage.localStorage.removeItem).toHaveBeenCalledOnce()
  })
})
