import { toBlob } from 'html-to-image'

import { UNIT_PNG_EXPORT_SIZE } from './unitPngLayout.ts'

type UnitPngRenderOptions = NonNullable<Parameters<typeof toBlob>[1]>

export type UnitPngRenderer = (
  node: HTMLElement,
  options: UnitPngRenderOptions,
) => Promise<Blob | null>

function nextPaint() {
  if (typeof requestAnimationFrame !== 'function') return Promise.resolve()
  return new Promise<void>((resolve) => {
    let finished = false
    const finish = () => {
      if (finished) return
      finished = true
      resolve()
    }
    window.setTimeout(finish, 250)
    requestAnimationFrame(() => requestAnimationFrame(finish))
  })
}

async function waitForEmbeddedImages(node: HTMLElement) {
  const images = Array.from(node.querySelectorAll('img'))
  await Promise.all(images.map(async (image) => {
    if (typeof image.decode !== 'function') return
    try {
      await image.decode()
    } catch {
      throw new Error(`${image.alt || '렌더 이미지'}를 PNG에 포함할 수 없습니다.`)
    }
  }))
}

export async function createUnitPngBlob(
  node: HTMLElement,
  renderer: UnitPngRenderer = toBlob,
) {
  if ('fonts' in document) await document.fonts.ready
  await waitForEmbeddedImages(node)
  await nextPaint()

  const blob = await renderer(node, {
    width: UNIT_PNG_EXPORT_SIZE.width,
    height: UNIT_PNG_EXPORT_SIZE.height,
    canvasWidth: UNIT_PNG_EXPORT_SIZE.width,
    canvasHeight: UNIT_PNG_EXPORT_SIZE.height,
    pixelRatio: 1,
    backgroundColor: '#071015',
    cacheBust: false,
    style: {
      width: `${UNIT_PNG_EXPORT_SIZE.width}px`,
      height: `${UNIT_PNG_EXPORT_SIZE.height}px`,
      minWidth: `${UNIT_PNG_EXPORT_SIZE.width}px`,
      maxWidth: 'none',
      boxSizing: 'border-box',
    },
  })

  if (!blob) throw new Error('PNG 이미지 데이터를 만들지 못했습니다.')
  return blob
}

function filenameSafeUnitName(name: string) {
  return name
    .normalize('NFKC')
    .split('')
    .map((character) => character.charCodeAt(0) < 32 ? '-' : character)
    .join('')
    .replace(/[<>:"/\\|?*]/g, '-')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[.-]+|[. -]+$/g, '')
    .slice(0, 60) || 'unit'
}

export function buildUnitPngFilename(name: string, now = new Date()) {
  const date = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('')
  return `nova-parts-unit-${filenameSafeUnitName(name)}-${date}.png`
}

export function downloadUnitPng(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.hidden = true
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}
