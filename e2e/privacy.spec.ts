import { expect, test } from '@playwright/test'

import { markUserGuideSeen } from './user-guide.ts'

test('핵심 사용 흐름에서 외부 요청이나 파일 업로드를 만들지 않는다', async ({ page }) => {
  await markUserGuideSeen(page)
  const httpRequests: Array<{ method: string; url: string }> = []
  const webSockets: string[] = []
  page.on('request', (request) => {
    httpRequests.push({ method: request.method(), url: request.url() })
  })
  page.on('websocket', (socket) => webSockets.push(socket.url()))

  await page.goto('/')
  await expect(page.getByRole('heading', { name: '내 덱 · ALPHA' })).toBeVisible()
  await page.getByRole('button', { name: '초기화', exact: true }).click()
  await page.getByRole('button', { name: /^몸통 부품 변경/ }).click()
  await page.getByRole('dialog', { name: '몸통 선택' })
    .getByRole('button', { name: '닫기' })
    .click()

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '현재 유닛을 JSON으로 내보내기' }).click()
  await downloadPromise

  const appUrl = new URL(page.url())
  for (const request of httpRequests) {
    const requestUrl = new URL(request.url)
    expect(requestUrl.host, `${request.method} ${request.url}`).toBe(appUrl.host)
    expect(request.method, request.url).toBe('GET')
  }
  for (const socketUrl of webSockets) {
    expect(new URL(socketUrl).host, socketUrl).toBe(appUrl.host)
  }
})
