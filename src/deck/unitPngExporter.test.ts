// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'

import {
  buildUnitPngFilename,
  createUnitPngBlob,
  downloadUnitPng,
  type UnitPngRenderer,
} from './unitPngExporter.ts'

describe('유닛 PNG 생성기', () => {
  it('고정 1600×1000 크기와 1배 픽셀 비율로 PNG Blob을 만든다', async () => {
    const node = document.createElement('article')
    const expected = new Blob(['png'], { type: 'image/png' })
    const renderer = vi.fn<UnitPngRenderer>().mockResolvedValue(expected)

    await expect(createUnitPngBlob(node, renderer)).resolves.toBe(expected)
    expect(renderer).toHaveBeenCalledWith(node, expect.objectContaining({
      width: 1600,
      height: 1000,
      canvasWidth: 1600,
      canvasHeight: 1000,
      pixelRatio: 1,
      backgroundColor: '#071015',
      style: expect.objectContaining({
        width: '1600px',
        height: '1000px',
      }),
    }))
  })

  it('파일명에서 Windows 금지 문자와 공백을 안전하게 정리한다', () => {
    expect(buildUnitPngFilename(
      '  ALPHA / 베타: 01  ',
      new Date(2026, 7, 20),
    )).toBe('nova-parts-unit-ALPHA-베타-01-20260820.png')
  })

  it('렌더러가 Blob을 반환하지 않으면 실패로 처리한다', async () => {
    const renderer = vi.fn<UnitPngRenderer>().mockResolvedValue(null)
    await expect(createUnitPngBlob(
      document.createElement('article'),
      renderer,
    )).rejects.toThrow('PNG 이미지 데이터를 만들지 못했습니다.')
  })

  it('Object URL을 지정한 파일명으로 다운로드한 뒤 해제한다', () => {
    vi.useFakeTimers()
    const blob = new Blob(['png'], { type: 'image/png' })
    const createObjectURL = vi.fn(() => 'blob:unit-png')
    const revokeObjectURL = vi.fn()
    Object.defineProperties(URL, {
      createObjectURL: { configurable: true, value: createObjectURL },
      revokeObjectURL: { configurable: true, value: revokeObjectURL },
    })
    let clickedDownload = ''
    let clickedHref = ''
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function captureAnchor(this: HTMLAnchorElement) {
        clickedDownload = this.download
        clickedHref = this.href
      })

    downloadUnitPng(blob, 'nova-unit.png')

    expect(createObjectURL).toHaveBeenCalledWith(blob)
    expect(clickedDownload).toBe('nova-unit.png')
    expect(clickedHref).toBe('blob:unit-png')
    expect(document.querySelector('a[download="nova-unit.png"]')).toBeNull()
    vi.runAllTimers()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:unit-png')

    click.mockRestore()
    vi.useRealTimers()
  })
})
