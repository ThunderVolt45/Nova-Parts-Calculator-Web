import type { GxMatrix } from './types.ts'

const MAX_SAFE_READ_LENGTH = 256 * 1024 * 1024

export class GxParseError extends Error {
  readonly code: string
  readonly offset: number

  constructor(
    code: string,
    message: string,
    offset: number,
  ) {
    super(message)
    this.name = 'GxParseError'
    this.code = code
    this.offset = offset
  }
}

export class BinaryReader {
  readonly bytes: Uint8Array
  readonly view: DataView

  constructor(buffer: ArrayBuffer) {
    if (buffer.byteLength > MAX_SAFE_READ_LENGTH) {
      throw new GxParseError(
        'FILE_TOO_LARGE',
        `GX 파일이 지원 크기를 초과합니다: ${buffer.byteLength} bytes`,
        0,
      )
    }
    this.bytes = new Uint8Array(buffer)
    this.view = new DataView(buffer)
  }

  get byteLength() {
    return this.bytes.byteLength
  }

  contains(offset: number, length: number, limit = this.byteLength) {
    return (
      Number.isSafeInteger(offset) &&
      Number.isSafeInteger(length) &&
      offset >= 0 &&
      length >= 0 &&
      limit >= 0 &&
      limit <= this.byteLength &&
      offset <= limit &&
      length <= limit - offset
    )
  }

  uint8(offset: number, limit = this.byteLength) {
    return this.contains(offset, 1, limit) ? this.view.getUint8(offset) : null
  }

  uint16(offset: number, limit = this.byteLength) {
    return this.contains(offset, 2, limit)
      ? this.view.getUint16(offset, true)
      : null
  }

  uint32(offset: number, limit = this.byteLength) {
    return this.contains(offset, 4, limit)
      ? this.view.getUint32(offset, true)
      : null
  }

  float32(offset: number, limit = this.byteLength) {
    return this.contains(offset, 4, limit)
      ? this.view.getFloat32(offset, true)
      : null
  }

  uint16Array(offset: number, count: number, limit = this.byteLength) {
    if (!this.contains(offset, count * 2, limit)) return null
    const values = new Uint16Array(count)
    for (let index = 0; index < count; index += 1) {
      values[index] = this.view.getUint16(offset + index * 2, true)
    }
    return values
  }

  uint32Array(offset: number, count: number, limit = this.byteLength) {
    if (!this.contains(offset, count * 4, limit)) return null
    const values = new Uint32Array(count)
    for (let index = 0; index < count; index += 1) {
      values[index] = this.view.getUint32(offset + index * 4, true)
    }
    return values
  }

  float32Array(offset: number, count: number, limit = this.byteLength) {
    if (!this.contains(offset, count * 4, limit)) return null
    const values = new Float32Array(count)
    for (let index = 0; index < count; index += 1) {
      values[index] = this.view.getFloat32(offset + index * 4, true)
    }
    return values
  }

  matrix(offset: number, limit = this.byteLength): GxMatrix | null {
    const values = this.float32Array(offset, 16, limit)
    return values ? (Array.from(values) as unknown as GxMatrix) : null
  }

  slice(offset: number, length: number, limit = this.byteLength) {
    return this.contains(offset, length, limit)
      ? this.bytes.slice(offset, offset + length)
      : null
  }
}

export function align(value: number, boundary: number) {
  const remainder = value % boundary
  return remainder === 0 ? value : value + boundary - remainder
}

export function isPlausibleFloatArray(values: Float32Array) {
  return values.every((value) => Number.isFinite(value) && Math.abs(value) < 1_000_000)
}
