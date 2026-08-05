import type { MountType } from '../domain/catalog/schema.ts'

export const LAB_UI_FILE_NAME = 'lab_ui.png'
export const LAB_UI_EXPECTED_SIZE = { width: 512, height: 512 } as const

export interface SpriteRect {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export type LabUiMountSpriteKey = `mount:${Exclude<MountType, 'none'>}`
export type LabUiSubcoreSpriteKey = `subcore:${number}`
export type LabUiSpriteKey = LabUiMountSpriteKey | LabUiSubcoreSpriteKey

const mountSpriteRects = {
  'mount:tower': { x: 320, y: 0, width: 32, height: 32 },
  'mount:arm': { x: 288, y: 0, width: 32, height: 32 },
  'mount:shoulder': { x: 256, y: 0, width: 32, height: 32 },
} as const satisfies Record<LabUiMountSpriteKey, SpriteRect>

const subcoreSpriteRects = Object.fromEntries(
  Array.from({ length: 12 }, (_, index) => {
    const subcoreId = index + 1
    return [
      `subcore:${subcoreId}`,
      {
        x: 352 + (index % 4) * 32,
        y: Math.floor(index / 4) * 32,
        width: 32,
        height: 32,
      },
    ]
  }),
) as Record<LabUiSubcoreSpriteKey, SpriteRect>

export const labUiSpriteRects: Readonly<Record<LabUiSpriteKey, SpriteRect>> = {
  ...mountSpriteRects,
  ...subcoreSpriteRects,
}

export const labUiSpriteKeys = Object.freeze(
  Object.keys(labUiSpriteRects) as LabUiSpriteKey[],
)

export function getMountSpriteKey(
  mountType: MountType,
): LabUiMountSpriteKey | null {
  return mountType === 'none' ? null : `mount:${mountType}`
}

export function getSubcoreSpriteKey(
  subcoreId: number,
): LabUiSubcoreSpriteKey | null {
  return Number.isInteger(subcoreId) && subcoreId >= 1 && subcoreId <= 12
    ? `subcore:${subcoreId}`
    : null
}

export function parsePngDimensions(header: ArrayBuffer) {
  const bytes = new Uint8Array(header)
  const signature = [137, 80, 78, 71, 13, 10, 26, 10]
  if (
    bytes.byteLength < 24 ||
    signature.some((value, index) => bytes[index] !== value) ||
    String.fromCharCode(...bytes.slice(12, 16)) !== 'IHDR'
  ) {
    throw new Error('lab_ui.png가 올바른 PNG 파일이 아닙니다.')
  }

  const view = new DataView(header)
  return {
    width: view.getUint32(16, false),
    height: view.getUint32(20, false),
  }
}

export async function validateLabUiFile(file: Blob) {
  const dimensions = parsePngDimensions(await file.slice(0, 24).arrayBuffer())
  if (
    dimensions.width !== LAB_UI_EXPECTED_SIZE.width ||
    dimensions.height !== LAB_UI_EXPECTED_SIZE.height
  ) {
    throw new Error(
      `지원하지 않는 lab_ui.png 크기입니다: ${dimensions.width}×${dimensions.height}`,
    )
  }
  return dimensions
}

export type SpriteCropper = (
  source: Blob,
  rect: SpriteRect,
) => Promise<Blob>

async function canvasToBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('스프라이트 PNG를 생성하지 못했습니다.'))
    }, 'image/png')
  })
}

function createCropCanvas(rect: SpriteRect) {
  const canvas = document.createElement('canvas')
  canvas.width = rect.width
  canvas.height = rect.height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('스프라이트 캔버스를 만들지 못했습니다.')
  return { canvas, context }
}

async function cropWithHtmlImage(source: Blob, rect: SpriteRect) {
  const url = URL.createObjectURL(source)
  const image = new Image()

  try {
    image.src = url
    await image.decode()
    const { canvas, context } = createCropCanvas(rect)
    context.drawImage(
      image,
      rect.x,
      rect.y,
      rect.width,
      rect.height,
      0,
      0,
      rect.width,
      rect.height,
    )
    return canvasToBlob(canvas)
  } finally {
    URL.revokeObjectURL(url)
  }
}

export const cropImageBlob: SpriteCropper = async (source, rect) => {
  if (typeof createImageBitmap !== 'function') {
    return cropWithHtmlImage(source, rect)
  }

  const bitmap = await createImageBitmap(
    source,
    rect.x,
    rect.y,
    rect.width,
    rect.height,
  )

  try {
    if (typeof OffscreenCanvas !== 'undefined') {
      const canvas = new OffscreenCanvas(rect.width, rect.height)
      const context = canvas.getContext('2d')
      if (!context) throw new Error('스프라이트 캔버스를 만들지 못했습니다.')
      context.drawImage(bitmap, 0, 0)
      return canvas.convertToBlob({ type: 'image/png' })
    }

    const { canvas, context } = createCropCanvas(rect)
    context.drawImage(bitmap, 0, 0)
    return canvasToBlob(canvas)
  } finally {
    bitmap.close()
  }
}

export async function extractLabUiSprites(
  file: Blob,
  keys: readonly LabUiSpriteKey[] = labUiSpriteKeys,
  cropper: SpriteCropper = cropImageBlob,
) {
  await validateLabUiFile(file)
  const uniqueKeys = [...new Set(keys)]
  const sprites = new Map<LabUiSpriteKey, Blob>()

  for (const key of uniqueKeys) {
    const rect = labUiSpriteRects[key]
    if (!rect) throw new Error(`알 수 없는 lab_ui 스프라이트입니다: ${key}`)
    sprites.set(key, await cropper(file, rect))
  }

  return sprites
}
