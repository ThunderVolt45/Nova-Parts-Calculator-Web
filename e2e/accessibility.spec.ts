import { expect, test, type Page } from '@playwright/test'

import { expectNoAutomatedViolations } from './accessibility.ts'
import { markUserGuideSeen, USER_GUIDE_STORAGE_KEY } from './user-guide.ts'

async function selectPart(
  page: Page,
  slot: '다리' | '몸통' | '무기',
  partName: string,
) {
  await page.getByRole('button', { name: new RegExp(`^${slot} 부품 변경`) }).click()
  const dialog = page.getByRole('dialog', { name: `${slot} 선택` })
  await dialog.getByRole('button', { name: partName, exact: true }).click()
  await dialog.getByRole('button', { name: `${partName} 사용`, exact: true }).click()
}

async function selectValidAssembly(page: Page) {
  await selectPart(page, '다리', '토들러')
  await selectPart(page, '몸통', '코포럴')
  await selectPart(page, '무기', '데미시즈')
}

test('첫 방문에는 퀵 가이드를 자동으로 열고 완료 상태를 기억한다', async ({ page }) => {
  await page.goto('/')

  const dialog = page.getByRole('dialog', { name: 'Nova Assembly 사용 가이드' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText(
    '조립부터 덱 백업과 3D 프리뷰까지, 필요한 기능을 한 화면에서 확인하세요.',
  )).toBeVisible()
  await expect(dialog.getByRole('button', { name: '가이드 닫고 조립 시작' }))
    .toBeVisible()
  await expectNoAutomatedViolations(page)

  await dialog.getByRole('button', { name: '가이드 닫고 조립 시작' }).click()
  await expect(dialog).toHaveCount(0)
  await expect.poll(() => page.evaluate(
    (storageKey) => {
      const browserGlobal = globalThis as unknown as {
        localStorage: { getItem(key: string): string | null }
      }
      return browserGlobal.localStorage.getItem(storageKey)
    },
    USER_GUIDE_STORAGE_KEY,
  )).toBe('seen')

  await page.reload()
  await expect(dialog).toHaveCount(0)
})

test.describe('자동 접근성 검사', () => {
  test.beforeEach(async ({ page }) => {
    await markUserGuideSeen(page)
    await page.goto('/')
    await expect(page.getByRole('heading', { name: '내 덱 · ALPHA' })).toBeVisible()
  })

  test('계산기 기본 화면이 WCAG A·AA 자동 검사 규칙을 통과한다', async ({ page }) => {
    await expectNoAutomatedViolations(page)
  })

  test('사용 가이드와 서비스 안내가 공개되고 접근성 검사를 통과한다', async ({ page }) => {
    await expect(page.getByText('비공식 팬 도구', { exact: true })).toHaveCount(0)
    const guideTrigger = page.getByRole('button', { name: '사용 가이드' })
    await guideTrigger.click()
    const guideDialog = page.getByRole('dialog', {
      name: 'Nova Assembly 사용 가이드',
    })
    await expect(guideDialog).toBeVisible()
    await expect(
      guideDialog.getByRole('img', { name: /Nova Assembly 데스크톱 화면/ }),
    ).toHaveAttribute('src', '/guide/overview-hd.jpg')
    await expect(guideDialog.getByRole('img')).toHaveCount(3)
    await expectNoAutomatedViolations(page)

    await page.keyboard.press('Escape')
    await expect(guideDialog).toHaveCount(0)
    await expect(guideTrigger).toBeFocused()

    await expect(page.getByRole('link', { name: '버그 신고' })).toHaveAttribute(
      'href',
      'https://github.com/ThunderVolt45/Nova-Parts-Calculator-Web/issues/new?template=bug_report.yml',
    )
    await page.getByText('서비스 안내', { exact: true }).click()
    await expect(
      page.getByRole('heading', { name: '서비스 및 개인정보 안내' }),
    ).toBeVisible()
    await expect(
      page.getByRole('heading', { name: '비공식 팬 제작 도구' }),
    ).toBeVisible()
    await expect(
      page.getByRole('link', { name: '권리 침해 신고 이메일 작성' }),
    ).toHaveAttribute(
      'href',
      /^mailto:contactvolt45@gmail\.com\?subject=/,
    )

    await expectNoAutomatedViolations(page)
  })

  test('부품 선택 대화상자가 WCAG A·AA 자동 검사 규칙을 통과한다', async ({ page }) => {
    await page.getByRole('button', { name: /^몸통 부품 변경/ }).click()
    await expect(page.getByRole('dialog', { name: '몸통 선택' })).toBeVisible()

    await expectNoAutomatedViolations(page)
  })

  test('부품 선택 대화상자 안에 포커스를 가두고 닫은 뒤 원래 위치로 복원한다', async ({ page }) => {
    const trigger = page.getByRole('button', { name: /^몸통 부품 변경/ })
    await trigger.click()

    const dialog = page.getByRole('dialog', { name: '몸통 선택' })
    const search = dialog.getByRole('searchbox', { name: '몸통 부품 검색' })
    const close = dialog.getByRole('button', { name: '부품 선택 닫기' })
    const lastAction = dialog.locator('.catalog-apply-button')

    await expect(search).toBeFocused()
    await page.keyboard.press('Shift+Tab')
    await expect(close).toBeFocused()
    await page.keyboard.press('Shift+Tab')
    await expect(lastAction).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(close).toBeFocused()

    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(trigger).toBeFocused()
  })

  test('JSON 가져오기 대화상자도 포커스와 Escape 닫기를 관리한다', async ({ page }) => {
    await selectValidAssembly(page)

    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: '현재 유닛을 JSON으로 내보내기' }).click()
    const download = await downloadPromise
    const downloadPath = await download.path()
    expect(downloadPath).not.toBeNull()

    const importTrigger = page.getByRole('button', { name: '유닛/덱 JSON 가져오기' })
    const chooserPromise = page.waitForEvent('filechooser')
    await importTrigger.click()
    const chooser = await chooserPromise
    await chooser.setFiles(downloadPath!)

    const dialog = page.getByRole('dialog', { name: '가져오기 방식 선택' })
    const primaryAction = dialog.getByRole('button', {
      name: '선택한 1번 슬롯에 유닛 붙여넣기',
    })
    const close = dialog.getByRole('button', { name: '가져오기 취소' })

    await expect(primaryAction).toBeFocused()
    await expectNoAutomatedViolations(page)
    await page.keyboard.press('Shift+Tab')
    await expect(close).toBeFocused()

    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(importTrigger).toBeFocused()
  })
})
