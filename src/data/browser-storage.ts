import type { DeckRepository } from '../deck/repository.ts'
import { deckRepository } from '../deck/repository.ts'
import type { LabUiSpriteCacheRepository } from '../gx/lab-ui-sprite-cache.ts'
import { labUiSpriteCacheRepository } from '../gx/lab-ui-sprite-cache.ts'
import type { ModelCacheRepository } from '../gx/model-cache.ts'
import { modelCacheRepository } from '../gx/model-cache.ts'

export const USER_GUIDE_STORAGE_KEY = 'nova-assembly:user-guide-seen:v1'

export interface BrowserStorageDependencies {
  readonly decks: Pick<DeckRepository, 'clear'>
  readonly models: Pick<ModelCacheRepository, 'clear'>
  readonly sprites: Pick<LabUiSpriteCacheRepository, 'clear'>
  readonly localStorage: Pick<Storage, 'removeItem'>
}

function defaultDependencies(): BrowserStorageDependencies {
  return {
    decks: deckRepository,
    models: modelCacheRepository,
    sprites: labUiSpriteCacheRepository,
    localStorage: window.localStorage,
  }
}

export async function clearBrowserStorage(
  dependencies: BrowserStorageDependencies = defaultDependencies(),
) {
  const results = await Promise.allSettled([
    dependencies.decks.clear(),
    dependencies.models.clear(),
    dependencies.sprites.clear(),
    Promise.resolve().then(() => {
      dependencies.localStorage.removeItem(USER_GUIDE_STORAGE_KEY)
    }),
  ])

  if (results.some((result) => result.status === 'rejected')) {
    throw new Error('일부 브라우저 저장 정보를 삭제하지 못했습니다.')
  }
}
