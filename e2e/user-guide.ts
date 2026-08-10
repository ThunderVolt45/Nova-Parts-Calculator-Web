import type { Page } from '@playwright/test'

export const USER_GUIDE_STORAGE_KEY = 'nova-assembly:user-guide-seen:v1'

export async function markUserGuideSeen(page: Page) {
  await page.addInitScript((storageKey) => {
    const browserGlobal = globalThis as unknown as {
      localStorage: { setItem(key: string, value: string): void }
    }
    browserGlobal.localStorage.setItem(storageKey, 'seen')
  }, USER_GUIDE_STORAGE_KEY)
}
