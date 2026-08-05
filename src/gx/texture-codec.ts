export interface DecodedTexture {
  readonly width: number
  readonly height: number
  readonly pixels: Uint8Array
}

const MAX_TEXTURE_DIMENSION = 8192
const MAX_TEXTURE_PIXELS = 32 * 1024 * 1024

function checkedDimensions(width: number, height: number) {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    width > MAX_TEXTURE_DIMENSION ||
    height > MAX_TEXTURE_DIMENSION ||
    width * height > MAX_TEXTURE_PIXELS
  ) {
    throw new Error(`지원하지 않는 텍스처 크기입니다: ${width}×${height}`)
  }
}

function requireBytes(
  bytes: Uint8Array,
  offset: number,
  length: number,
  message: string,
) {
  if (
    !Number.isSafeInteger(offset) ||
    !Number.isSafeInteger(length) ||
    offset < 0 ||
    length < 0 ||
    offset > bytes.length ||
    length > bytes.length - offset
  ) {
    throw new Error(message)
  }
}

export function decodeTga(buffer: ArrayBuffer): DecodedTexture {
  const bytes = new Uint8Array(buffer)
  requireBytes(bytes, 0, 18, 'TGA 헤더가 잘렸습니다.')
  const view = new DataView(buffer)
  const idLength = bytes[0]
  const colorMapType = bytes[1]
  const imageType = bytes[2]
  const width = view.getUint16(12, true)
  const height = view.getUint16(14, true)
  const pixelDepth = bytes[16]
  const descriptor = bytes[17]
  checkedDimensions(width, height)
  if (colorMapType !== 0 || (imageType !== 2 && imageType !== 10)) {
    throw new Error('지원하지 않는 TGA 이미지 형식입니다.')
  }
  if (![16, 24, 32].includes(pixelDepth)) {
    throw new Error(`지원하지 않는 TGA 비트 심도입니다: ${pixelDepth}`)
  }

  const bytesPerPixel = pixelDepth / 8
  const pixelCount = width * height
  const raw = new Uint8Array(pixelCount * bytesPerPixel)
  let sourceOffset = 18 + idLength
  let rawOffset = 0

  if (imageType === 2) {
    requireBytes(
      bytes,
      sourceOffset,
      raw.length,
      'TGA 픽셀 데이터가 잘렸습니다.',
    )
    raw.set(bytes.subarray(sourceOffset, sourceOffset + raw.length))
  } else {
    while (rawOffset < raw.length) {
      requireBytes(bytes, sourceOffset, 1, 'TGA RLE 데이터가 잘렸습니다.')
      const packet = bytes[sourceOffset]
      sourceOffset += 1
      const count = (packet & 0x7f) + 1
      const packetBytes = count * bytesPerPixel
      if (packetBytes > raw.length - rawOffset) {
        throw new Error('TGA RLE 패킷이 픽셀 범위를 초과합니다.')
      }

      if ((packet & 0x80) !== 0) {
        requireBytes(
          bytes,
          sourceOffset,
          bytesPerPixel,
          'TGA RLE 픽셀이 잘렸습니다.',
        )
        for (let index = 0; index < count; index += 1) {
          raw.set(
            bytes.subarray(sourceOffset, sourceOffset + bytesPerPixel),
            rawOffset,
          )
          rawOffset += bytesPerPixel
        }
        sourceOffset += bytesPerPixel
      } else {
        requireBytes(
          bytes,
          sourceOffset,
          packetBytes,
          'TGA RLE 원시 패킷이 잘렸습니다.',
        )
        raw.set(bytes.subarray(sourceOffset, sourceOffset + packetBytes), rawOffset)
        sourceOffset += packetBytes
        rawOffset += packetBytes
      }
    }
  }

  const originTop = (descriptor & 0x20) !== 0
  const originRight = (descriptor & 0x10) !== 0
  const alphaBits = descriptor & 0x0f
  const pixels = new Uint8Array(pixelCount * 4)
  for (let index = 0; index < pixelCount; index += 1) {
    const source = index * bytesPerPixel
    const sourceX = index % width
    const sourceY = Math.floor(index / width)
    const x = originRight ? width - 1 - sourceX : sourceX
    const y = originTop ? sourceY : height - 1 - sourceY
    const target = (y * width + x) * 4

    if (pixelDepth === 16) {
      const value = raw[source] | (raw[source + 1] << 8)
      pixels[target] = Math.floor(((value >> 10) & 0x1f) * 255 / 31)
      pixels[target + 1] = Math.floor(((value >> 5) & 0x1f) * 255 / 31)
      pixels[target + 2] = Math.floor((value & 0x1f) * 255 / 31)
      pixels[target + 3] = alphaBits > 0 && (value & 0x8000) === 0 ? 0 : 255
    } else {
      pixels[target] = raw[source + 2]
      pixels[target + 1] = raw[source + 1]
      pixels[target + 2] = raw[source]
      pixels[target + 3] = pixelDepth === 32 ? raw[source + 3] : 255
    }
  }

  return { width, height, pixels }
}

export function decodeBmp(buffer: ArrayBuffer): DecodedTexture {
  const bytes = new Uint8Array(buffer)
  requireBytes(bytes, 0, 54, 'BMP 헤더가 잘렸습니다.')
  if (bytes[0] !== 0x42 || bytes[1] !== 0x4d) {
    throw new Error('올바른 BMP 파일이 아닙니다.')
  }
  const view = new DataView(buffer)
  const pixelOffset = view.getUint32(10, true)
  const dibSize = view.getUint32(14, true)
  if (dibSize < 40) throw new Error(`지원하지 않는 BMP DIB입니다: ${dibSize}`)
  const rawWidth = view.getInt32(18, true)
  const rawHeight = view.getInt32(22, true)
  const planes = view.getUint16(26, true)
  const bitDepth = view.getUint16(28, true)
  const compression = view.getUint32(30, true)
  const width = Math.abs(rawWidth)
  const height = Math.abs(rawHeight)
  checkedDimensions(width, height)
  if (planes !== 1 || compression !== 0 || ![8, 16, 24, 32].includes(bitDepth)) {
    throw new Error(
      `지원하지 않는 BMP 형식입니다: ${bitDepth}bit, compression ${compression}`,
    )
  }

  const palette: number[][] = []
  if (bitDepth === 8) {
    const colorCount = view.getUint32(46, true) || 256
    const paletteOffset = 14 + dibSize
    if (colorCount > 256) throw new Error('BMP 팔레트가 범위를 초과합니다.')
    requireBytes(
      bytes,
      paletteOffset,
      colorCount * 4,
      'BMP 팔레트가 잘렸습니다.',
    )
    for (let index = 0; index < colorCount; index += 1) {
      const offset = paletteOffset + index * 4
      palette.push([bytes[offset + 2], bytes[offset + 1], bytes[offset], 255])
    }
  }

  const rowBytes = Math.ceil((width * bitDepth) / 32) * 4
  requireBytes(
    bytes,
    pixelOffset,
    rowBytes * height,
    'BMP 픽셀 데이터가 잘렸습니다.',
  )
  const topDown = rawHeight < 0
  const pixels = new Uint8Array(width * height * 4)
  for (let sourceY = 0; sourceY < height; sourceY += 1) {
    const y = topDown ? sourceY : height - 1 - sourceY
    const row = pixelOffset + sourceY * rowBytes
    for (let x = 0; x < width; x += 1) {
      const target = (y * width + x) * 4
      if (bitDepth === 8) {
        const color = palette[bytes[row + x]]
        if (!color) throw new Error('BMP 팔레트 인덱스가 범위를 초과합니다.')
        pixels.set(color, target)
      } else if (bitDepth === 16) {
        const value = view.getUint16(row + x * 2, true)
        pixels[target] = Math.floor(((value >> 10) & 0x1f) * 255 / 31)
        pixels[target + 1] = Math.floor(((value >> 5) & 0x1f) * 255 / 31)
        pixels[target + 2] = Math.floor((value & 0x1f) * 255 / 31)
        pixels[target + 3] = 255
      } else {
        const source = row + x * (bitDepth / 8)
        pixels[target] = bytes[source + 2]
        pixels[target + 1] = bytes[source + 1]
        pixels[target + 2] = bytes[source]
        pixels[target + 3] = bitDepth === 32 ? bytes[source + 3] || 255 : 255
      }
    }
  }
  return { width, height, pixels }
}

export function textureHasTransparency(pixels: Uint8Array) {
  for (let offset = 3; offset < pixels.length; offset += 4) {
    if (pixels[offset] < 255) return true
  }
  return false
}

export function applyBlackAdditiveAlpha(pixels: Uint8Array) {
  const output = pixels.slice()
  for (let offset = 0; offset < output.length; offset += 4) {
    const red = output[offset]
    const green = output[offset + 1]
    const blue = output[offset + 2]
    const sourceAlpha = output[offset + 3]
    const intensity = Math.max(red, green, blue)
    const alpha = Math.floor(intensity * sourceAlpha / 255)
    if (intensity === 0 || alpha === 0) {
      output.fill(0, offset, offset + 4)
      continue
    }
    output[offset] = Math.min(255, Math.round(red * 255 / intensity))
    output[offset + 1] = Math.min(255, Math.round(green * 255 / intensity))
    output[offset + 2] = Math.min(255, Math.round(blue * 255 / intensity))
    output[offset + 3] = alpha
  }
  return output
}

const crcTable = (() => {
  const table = new Uint32Array(256)
  for (let index = 0; index < 256; index += 1) {
    let value = index
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    }
    table[index] = value >>> 0
  }
  return table
})()

function crc32(bytes: Uint8Array) {
  let value = 0xffffffff
  for (const byte of bytes) value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8)
  return (value ^ 0xffffffff) >>> 0
}

function adler32(bytes: Uint8Array) {
  let a = 1
  let b = 0
  for (const byte of bytes) {
    a = (a + byte) % 65521
    b = (b + a) % 65521
  }
  return ((b << 16) | a) >>> 0
}

function uint32BigEndian(value: number) {
  const bytes = new Uint8Array(4)
  new DataView(bytes.buffer).setUint32(0, value, false)
  return bytes
}

function joinBytes(parts: readonly Uint8Array[]) {
  const output = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let offset = 0
  for (const part of parts) {
    output.set(part, offset)
    offset += part.length
  }
  return output
}

function pngChunk(type: string, payload: Uint8Array) {
  const typeBytes = new TextEncoder().encode(type)
  const checksum = crc32(joinBytes([typeBytes, payload]))
  return joinBytes([
    uint32BigEndian(payload.length),
    typeBytes,
    payload,
    uint32BigEndian(checksum),
  ])
}

function uncompressedZlib(bytes: Uint8Array) {
  const blocks: Uint8Array[] = [new Uint8Array([0x78, 0x01])]
  for (let offset = 0; offset < bytes.length || offset === 0; offset += 65_535) {
    const length = Math.min(65_535, bytes.length - offset)
    const final = offset + length >= bytes.length
    const header = new Uint8Array(5)
    header[0] = final ? 1 : 0
    new DataView(header.buffer).setUint16(1, length, true)
    new DataView(header.buffer).setUint16(3, 0xffff - length, true)
    blocks.push(header, bytes.subarray(offset, offset + length))
    if (final) break
  }
  blocks.push(uint32BigEndian(adler32(bytes)))
  return joinBytes(blocks)
}

function rgbaPngParts(texture: DecodedTexture) {
  checkedDimensions(texture.width, texture.height)
  if (texture.pixels.length !== texture.width * texture.height * 4) {
    throw new Error('RGBA 픽셀 길이가 텍스처 크기와 일치하지 않습니다.')
  }
  const scanlines = new Uint8Array(texture.height * (texture.width * 4 + 1))
  for (let y = 0; y < texture.height; y += 1) {
    const target = y * (texture.width * 4 + 1)
    scanlines[target] = 0
    scanlines.set(
      texture.pixels.subarray(y * texture.width * 4, (y + 1) * texture.width * 4),
      target + 1,
    )
  }
  const header = new Uint8Array(13)
  const view = new DataView(header.buffer)
  view.setUint32(0, texture.width, false)
  view.setUint32(4, texture.height, false)
  header.set([8, 6, 0, 0, 0], 8)
  return { header, scanlines }
}

function buildRgbaPng(header: Uint8Array, zlib: Uint8Array) {
  return joinBytes([
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', zlib),
    pngChunk('IEND', new Uint8Array()),
  ])
}

export function encodeRgbaPng(texture: DecodedTexture) {
  const { header, scanlines } = rgbaPngParts(texture)
  return buildRgbaPng(header, uncompressedZlib(scanlines))
}

export async function encodeCompressedRgbaPng(texture: DecodedTexture) {
  const { header, scanlines } = rgbaPngParts(texture)
  if (typeof CompressionStream === 'undefined') {
    return buildRgbaPng(header, uncompressedZlib(scanlines))
  }
  try {
    const stream = new CompressionStream('deflate')
    const compressed = new Response(stream.readable).arrayBuffer()
    const writer = stream.writable.getWriter()
    await writer.write(scanlines)
    await writer.close()
    return buildRgbaPng(header, new Uint8Array(await compressed))
  } catch {
    return buildRgbaPng(header, uncompressedZlib(scanlines))
  }
}

export async function decodeTextureWithBrowser(
  buffer: ArrayBuffer,
  mimeType: string,
) {
  if (typeof createImageBitmap !== 'function' || typeof OffscreenCanvas === 'undefined') {
    throw new Error('이 브라우저에는 텍스처 디코딩 기능이 없습니다.')
  }
  const bitmap = await createImageBitmap(new Blob([buffer], { type: mimeType }))
  try {
    checkedDimensions(bitmap.width, bitmap.height)
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) throw new Error('텍스처 캔버스를 만들지 못했습니다.')
    context.drawImage(bitmap, 0, 0)
    const image = context.getImageData(0, 0, bitmap.width, bitmap.height)
    return {
      width: bitmap.width,
      height: bitmap.height,
      pixels: new Uint8Array(image.data),
    }
  } finally {
    bitmap.close()
  }
}
