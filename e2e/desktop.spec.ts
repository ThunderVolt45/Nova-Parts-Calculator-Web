import { readFile } from 'node:fs/promises'

import { expect, test, type Page } from '@playwright/test'

async function openCalculator(page: Page) {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '내 덱 · ALPHA' })).toBeVisible()
}

async function resetToValidAssembly(page: Page) {
  await page.getByRole('button', { name: '초기화', exact: true }).click()
  await expect(page.locator('.status-pill')).toHaveText('조립 완료')
  await expect(page.getByRole('button', { name: '유닛 등록', exact: true })).toBeEnabled()
}

test.describe('데스크톱 핵심 사용자 흐름', () => {
  test.beforeEach(async ({ page }) => {
    await openCalculator(page)
  })

  test('유닛을 조립해 덱에 저장하고 새로고침 후 복원한다', async ({ page }) => {
    const initialAlert = page.getByRole('alert')
    await expect(initialAlert).toContainText('다리 부품이 없습니다.')
    await expect(initialAlert).toContainText('몸통 부품이 없습니다.')
    await expect(initialAlert).toContainText('무기 부품이 없습니다.')

    await resetToValidAssembly(page)

    await page.getByRole('textbox', { name: '저장할 유닛 이름' }).fill('E2E 테스트 유닛')
    await page.getByRole('button', { name: '유닛 등록', exact: true }).click()

    await expect(page.getByText('1번 슬롯에 유닛을 등록했습니다.', { exact: true })).toBeVisible()
    await expect(
      page.getByRole('button', { name: '1번 덱 슬롯, E2E 테스트 유닛 저장됨' }),
    ).toBeVisible()

    await page.reload()

    await expect(
      page.getByRole('button', { name: '1번 덱 슬롯, E2E 테스트 유닛 저장됨' }),
    ).toBeVisible()
    await expect(page.getByRole('textbox', { name: '저장할 유닛 이름' })).toHaveValue(
      'E2E 테스트 유닛',
    )
    await expect(page.locator('.status-pill')).toHaveText('조립 완료')
  })

  test('필수 부품을 제거하면 조립 오류를 표시하고 등록을 막는다', async ({ page }) => {
    await resetToValidAssembly(page)

    await page.getByRole('button', { name: /^몸통 부품 변경/ }).click()
    const dialog = page.getByRole('dialog', { name: '몸통 선택' })
    await dialog.getByRole('button', { name: '부품 없음', exact: true }).click()
    await dialog.getByRole('button', { name: '부품 없음 사용', exact: true }).click()

    const alert = page.getByRole('alert')
    await expect(alert).toContainText('조립 불가')
    await expect(alert).toContainText('몸통 부품이 없습니다.')
    await expect(page.getByRole('button', { name: '유닛 등록', exact: true })).toBeDisabled()
    await expect(page.getByRole('button', { name: /^몸통 부품 변경/ })).toHaveAccessibleName(
      '몸통 부품 변경, 현재 부품 없음',
    )

    await resetToValidAssembly(page)
    await expect(page.getByRole('alert')).toHaveCount(0)
  })

  test('현재 유닛 JSON을 내보내 다른 덱 슬롯으로 다시 가져온다', async ({ page }) => {
    await resetToValidAssembly(page)

    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: '현재 유닛을 JSON으로 내보내기' }).click()
    const download = await downloadPromise

    expect(download.suggestedFilename()).toMatch(/^nova-parts-unit-\d{4}-\d{2}-\d{2}\.json$/)
    const downloadPath = await download.path()
    expect(downloadPath).not.toBeNull()

    const exported = JSON.parse(await readFile(downloadPath!, 'utf8')) as Record<string, unknown>
    expect(exported).toMatchObject({
      format: 'nova-parts-deck',
      schemaVersion: 1,
      kind: 'unit',
      decks: [],
      unit: { name: 'UNIT-01' },
    })

    await page.getByRole('button', { name: '2번 덱 슬롯, 비어 있음' }).click()
    await expect(page.locator('.status-pill')).toHaveText('부품 없음')

    await page.getByLabel('덱 JSON 파일').setInputFiles(downloadPath!)
    const importDialog = page.getByRole('dialog', { name: '가져오기 방식 선택' })
    await expect(importDialog).toContainText('유닛 1개 · UNIT-01')
    await importDialog
      .getByRole('button', { name: '선택한 2번 슬롯에 유닛 붙여넣기' })
      .click()

    await expect(page.getByText('2번 슬롯에 UNIT-01을(를) 가져왔습니다.', { exact: true }))
      .toBeVisible()
    await expect(page.getByRole('button', { name: '2번 덱 슬롯, UNIT-01 저장됨' }))
      .toBeVisible()
    await expect(page.locator('.status-pill')).toHaveText('조립 완료')
  })
})
