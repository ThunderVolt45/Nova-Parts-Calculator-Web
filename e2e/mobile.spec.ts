import { expect, test } from '@playwright/test'

test('모바일 하단 탭에서 조립·시뮬레이션·능력치·덱 화면을 전환한다', async ({ page }) => {
  await page.goto('/')

  const mobileNavigation = page.getByRole('navigation', { name: '모바일 화면 전환' })
  await expect(page.getByRole('heading', { name: '부품 조립' })).toBeVisible()
  await expect(page.getByText('3D 미리보기는 PC에서 사용할 수 있습니다.')).toBeVisible()
  await expect(page.getByRole('region', { name: '조립 유닛 프리뷰' })).toBeHidden()

  await mobileNavigation.getByRole('button', { name: '덱', exact: true }).click()
  await expect(page.getByRole('heading', { name: '내 덱 · ALPHA' })).toBeVisible()
  await expect(page.locator('.deck-slots > button')).toHaveCount(10)

  await mobileNavigation.getByRole('button', { name: '능력치', exact: true }).click()
  await expect(page.getByRole('heading', { name: '능력치' })).toBeVisible()
  await expect(page.getByRole('alert')).toContainText('조립 불가')

  await mobileNavigation.getByRole('button', { name: '시뮬레이션', exact: true }).click()
  await expect(page.getByRole('heading', { name: '전투 시뮬레이션' })).toBeVisible()

  await mobileNavigation.getByRole('button', { name: '조립', exact: true }).click()
  await expect(page.getByRole('heading', { name: '부품 조립' })).toBeVisible()
})
