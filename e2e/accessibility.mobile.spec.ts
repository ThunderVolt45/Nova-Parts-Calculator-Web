import { expect, test } from '@playwright/test'

import { expectNoAutomatedViolations } from './accessibility.ts'
import { markUserGuideSeen } from './user-guide.ts'

test('모바일의 조립·시뮬레이션·능력치·덱 화면이 WCAG A·AA 자동 검사를 통과한다', async ({ page }) => {
  await markUserGuideSeen(page)
  await page.goto('/')

  const navigation = page.getByRole('navigation', { name: '모바일 화면 전환' })
  const views = [
    { button: '조립', heading: '부품 조립' },
    { button: '시뮬레이션', heading: '전투 시뮬레이션' },
    { button: '능력치', heading: '능력치' },
    { button: '덱', heading: '내 덱 · ALPHA' },
  ] as const

  for (const view of views) {
    await navigation.getByRole('button', { name: view.button, exact: true }).click()
    await expect(page.getByRole('heading', { name: view.heading })).toBeVisible()
    await expectNoAutomatedViolations(page)
  }
})
