import {
  align,
  BinaryReader,
  GxParseError,
  isPlausibleFloatArray,
} from './binary.ts'
import type {
  GxFrame,
  GxGeometry,
  GxGeometryMetadata,
  GxKeyframeBlock,
  GxMaterial,
  GxMatrix,
  GxMesh,
  GxParseDiagnostic,
  GxParseResult,
  GxSpriteAnimation,
} from './types.ts'

export const GX_PARSER_VERSION = '1'

const TEXTURE_TOKEN = '4294901779d'
const FRAME_TOKEN = '4294901778d'
const GEOMETRY_TOKEN = '4294901781d'
const KEYFRAME_TOKEN = '4294901782d'
const MATERIAL_TOKEN = '4294901783d'
const DRAW_TOKEN = '4294901773d'
const CLOSE_TOKEN = '4294901766d'
const MARKER_PREFIX = '42949017'
const MAX_CHUNKS = 100_000
const MAX_STRING_BYTES = 512
const MAX_MATRIX_COUNT = 10_000
const MAX_VERTEX_COUNT = 1_000_000
const MAX_INDEX_COUNT = 3_000_000
const MAX_TABLE_COUNT = 100_000

const STRUCTURAL_TOKENS = new Set([
  FRAME_TOKEN,
  DRAW_TOKEN,
  GEOMETRY_TOKEN,
  KEYFRAME_TOKEN,
])

export const GX_IDENTITY_MATRIX: GxMatrix = [
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
]

interface ChunkMarker {
  readonly token: string
  readonly start: number
  readonly end: number
  readonly hasPayload: boolean
}

interface MutableFrame {
  index: number
  name: string | null
  parentIndex: number | null
  localMatrix: GxMatrix
  worldMatrix: GxMatrix
  keyframes: GxKeyframeBlock | null
}

interface ParsedGeometryArrays {
  readonly positions: Float32Array
  readonly normals: Float32Array
  readonly uvs: Float32Array
  readonly indices: Uint32Array
  readonly sourceIndexBase: 0 | 1
}

function isAsciiDigit(value: number) {
  return value >= 48 && value <= 57
}

function scanChunkMarkers(reader: BinaryReader) {
  const prefix = new TextEncoder().encode(MARKER_PREFIX)
  const markers: ChunkMarker[] = []

  for (let offset = 0; offset + 11 <= reader.byteLength; offset += 1) {
    let matches = true
    for (let index = 0; index < prefix.length; index += 1) {
      if (reader.bytes[offset + index] !== prefix[index]) {
        matches = false
        break
      }
    }
    if (!matches) continue

    const digit0 = reader.bytes[offset + 8]
    const digit1 = reader.bytes[offset + 9]
    if (!isAsciiDigit(digit0) || !isAsciiDigit(digit1)) continue
    if (reader.bytes[offset + 10] !== 100) continue

    const hasPayload = reader.bytes[offset + 11] === 123
    const end = offset + (hasPayload ? 12 : 11)
    const token = new TextDecoder('ascii').decode(reader.bytes.slice(offset, offset + 11))
    markers.push({ token, start: offset, end, hasPayload })
    if (markers.length > MAX_CHUNKS) {
      throw new GxParseError(
        'TOO_MANY_CHUNKS',
        `GX 청크 수가 제한을 초과합니다: ${MAX_CHUNKS}`,
        offset,
      )
    }
    offset = end - 1
  }

  return markers
}

function decodeLegacyText(bytes: Uint8Array) {
  for (const encoding of ['utf-8', 'euc-kr', 'windows-1252']) {
    try {
      return new TextDecoder(encoding, { fatal: true }).decode(bytes)
    } catch {
      // Try the next encoding used by the original resources.
    }
  }
  return new TextDecoder('windows-1252').decode(bytes)
}

function readCString(
  reader: BinaryReader,
  offset: number,
  size: number,
  limit: number,
) {
  const bytes = reader.slice(offset, size, limit)
  if (!bytes) return null
  const terminator = bytes.indexOf(0)
  return decodeLegacyText(terminator >= 0 ? bytes.slice(0, terminator) : bytes)
}

function basenameWithoutExtension(value: string) {
  const name = value.replaceAll('\\', '/').split('/').at(-1) ?? value
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(0, dot) : name
}

function multiplyMatrices(left: GxMatrix, right: GxMatrix): GxMatrix {
  const result = new Array<number>(16).fill(0)
  for (let row = 0; row < 4; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      for (let index = 0; index < 4; index += 1) {
        result[row * 4 + column] +=
          left[row * 4 + index] * right[index * 4 + column]
      }
    }
  }
  return result as unknown as GxMatrix
}

function parseSizedString(
  reader: BinaryReader,
  payload: number,
  limit: number,
) {
  const size = reader.uint32(payload, limit)
  if (size === null || size === 0 || size > MAX_STRING_BYTES) return null
  return readCString(reader, payload + 4, size, limit)
}

function parseFrame(
  reader: BinaryReader,
  payload: number,
  limit: number,
) {
  const size = reader.uint32(payload, limit)
  if (size === null || size === 0 || size > MAX_STRING_BYTES) return null
  const sourceName = readCString(reader, payload + 4, size, limit)
  const matrix = reader.matrix(payload + 4 + size, limit)
  if (sourceName === null || matrix === null || !isPlausibleMatrix(matrix)) {
    return null
  }
  return { name: basenameWithoutExtension(sourceName), matrix }
}

function isPlausibleMatrix(matrix: GxMatrix) {
  return matrix.every(
    (value) => Number.isFinite(value) && Math.abs(value) < 1_000_000,
  )
}

function parseMaterial(
  reader: BinaryReader,
  payload: number,
  limit: number,
): GxMaterial | null {
  const raw = reader.uint32Array(payload, 8, limit)
  if (!raw) return null
  const values = Array.from(raw)
  return {
    unknown0: values[0],
    unknown1: values[1],
    ambient: values[2],
    diffuse: values[3],
    specular: values[4],
    emissive: values[5],
    extra: values[6],
    flags: values[7],
    raw: values,
  }
}

function asciiIntegerUntilD(
  reader: BinaryReader,
  offset: number,
  limit: number,
) {
  let cursor = offset
  while (cursor < limit && reader.bytes[cursor] !== 100) {
    if (!isAsciiDigit(reader.bytes[cursor])) return null
    cursor += 1
  }
  if (cursor === offset || cursor >= limit) return null
  const text = new TextDecoder('ascii').decode(reader.bytes.slice(offset, cursor))
  const value = Number(text)
  return Number.isSafeInteger(value) ? { value, body: cursor + 1 } : null
}

function parseKeyframeBlock(
  reader: BinaryReader,
  payload: number,
  limit: number,
): GxKeyframeBlock | null {
  const countField = asciiIntegerUntilD(reader, payload, limit)
  if (
    !countField ||
    countField.value <= 0 ||
    countField.value > MAX_MATRIX_COUNT
  ) {
    return null
  }

  const matrixBytes = countField.value * 64
  if (!reader.contains(countField.body, matrixBytes, limit)) return null
  const matrices: GxMatrix[] = []
  for (let index = 0; index < countField.value; index += 1) {
    const matrix = reader.matrix(countField.body + index * 64, limit)
    if (!matrix || !isPlausibleMatrix(matrix)) return null
    matrices.push(matrix)
  }

  const matrixEnd = countField.body + matrixBytes
  const timelineField = asciiIntegerUntilD(reader, matrixEnd, limit)
  if (!timelineField) return { matrices, timelineIndices: new Uint16Array() }
  if (timelineField.value < 0 || timelineField.value > MAX_MATRIX_COUNT) {
    return { matrices, timelineIndices: new Uint16Array() }
  }

  const timeline = reader.uint16Array(
    timelineField.body,
    timelineField.value,
    limit,
  )
  if (!timeline || timeline.some((value) => value >= matrices.length)) {
    return { matrices, timelineIndices: new Uint16Array() }
  }
  return { matrices, timelineIndices: timeline }
}

function parseGeometryArrays(
  reader: BinaryReader,
  cursor: number,
  limit: number,
  vertexCount: number,
  indexCount: number,
): ParsedGeometryArrays | null {
  if (
    vertexCount <= 0 ||
    vertexCount >= MAX_VERTEX_COUNT ||
    indexCount <= 0 ||
    indexCount >= MAX_INDEX_COUNT
  ) {
    return null
  }

  const positions = reader.float32Array(cursor, vertexCount * 3, limit)
  if (!positions || !isPlausibleFloatArray(positions)) return null
  cursor += vertexCount * 3 * 4
  const normals = reader.float32Array(cursor, vertexCount * 3, limit)
  if (!normals || !isPlausibleFloatArray(normals)) return null
  cursor += vertexCount * 3 * 4
  const uvs = reader.float32Array(cursor, vertexCount * 2, limit)
  if (!uvs || !isPlausibleFloatArray(uvs)) return null
  cursor += vertexCount * 2 * 4

  const candidates = [...new Set([
    cursor,
    align(cursor, 2),
    align(cursor, 4),
    align(cursor, 8),
  ])]
  for (const indexOffset of candidates) {
    const sourceIndices = reader.uint16Array(indexOffset, indexCount, limit)
    if (!sourceIndices) continue
    let minimum = Number.POSITIVE_INFINITY
    let maximum = Number.NEGATIVE_INFINITY
    for (const value of sourceIndices) {
      minimum = Math.min(minimum, value)
      maximum = Math.max(maximum, value)
    }

    let sourceIndexBase: 0 | 1
    if (minimum === 0 && maximum < vertexCount) sourceIndexBase = 0
    else if (minimum >= 1 && maximum <= vertexCount) sourceIndexBase = 1
    else continue

    const indices = new Uint32Array(indexCount)
    for (let index = 0; index < sourceIndices.length; index += 1) {
      indices[index] = sourceIndices[index] - sourceIndexBase
    }
    return { positions, normals, uvs, indices, sourceIndexBase }
  }

  return null
}

function withMetadata(
  arrays: ParsedGeometryArrays | null,
  metadata: GxGeometryMetadata,
): GxGeometry | null {
  return arrays ? { ...arrays, metadata } : null
}

function parseStandardGeometry(
  reader: BinaryReader,
  payload: number,
  limit: number,
) {
  const header = payload + 1
  const fields = reader.uint32Array(header, 4, limit)
  if (!fields) return null
  return withMetadata(
    parseGeometryArrays(reader, header + 16, limit, fields[2], fields[3]),
    { variant: 'standard', unknown0: fields[0], unknown1: fields[1] },
  )
}

function parseTableGeometry(
  reader: BinaryReader,
  payload: number,
  limit: number,
) {
  const tableType = reader.uint8(payload, limit)
  if (tableType !== 1 && tableType !== 6) return null
  if (limit - payload < 10_000) return null
  const unknownCount = reader.uint32(payload + 1, limit)
  const tableCount = reader.uint32(payload + 5, limit)
  if (
    unknownCount === null ||
    tableCount === null ||
    tableCount <= 0 ||
    tableCount >= MAX_TABLE_COUNT
  ) {
    return null
  }
  const table = reader.uint32Array(payload + 9, tableCount, limit)
  if (!table) return null
  const embeddedHeader = payload + 9 + tableCount * 4
  const vertexCount = reader.uint32(embeddedHeader, limit)
  const indexCount = reader.uint32(embeddedHeader + 4, limit)
  if (vertexCount === null || indexCount === null) return null
  return withMetadata(
    parseGeometryArrays(
      reader,
      embeddedHeader + 8,
      limit,
      vertexCount,
      indexCount,
    ),
    { variant: 'table', tableType, unknownCount, table },
  )
}

function parseSpriteGeometry(
  reader: BinaryReader,
  payload: number,
  limit: number,
) {
  if (reader.uint8(payload, limit) !== 1) return null
  const spriteCount = reader.uint32(payload + 1, limit)
  const timelineCount = reader.uint32(payload + 5, limit)
  if (
    spriteCount === null ||
    timelineCount === null ||
    spriteCount <= 1 ||
    spriteCount > 4096 ||
    timelineCount <= 0 ||
    timelineCount > 100_000
  ) {
    return null
  }

  const timelineOffset = payload + 9
  const timelineIndices = reader.uint32Array(
    timelineOffset,
    timelineCount,
    limit,
  )
  if (!timelineIndices || timelineIndices.some((value) => value >= spriteCount)) {
    return null
  }

  const embeddedHeader = timelineOffset + timelineCount * 4
  const vertexCount = reader.uint32(embeddedHeader, limit)
  const indexCount = reader.uint32(embeddedHeader + 4, limit)
  if (vertexCount !== 4 || indexCount !== 6) return null
  const baseEnd = embeddedHeader + 8 + vertexCount * 32 + indexCount * 2
  const deformationHeader = baseEnd
  const deformationFloatCount = (4 * vertexCount + 1) * 3
  const deformationSize = 8 + deformationFloatCount * 4
  const atlasRecordSize = 8 + vertexCount * 2 * 4 + 8
  const atlasOffset = deformationHeader + deformationSize
  const expectedEnd = atlasOffset + (spriteCount - 1) * atlasRecordSize
  if (expectedEnd !== limit) return null
  if (
    reader.uint32(deformationHeader, limit) !== vertexCount ||
    reader.uint32(deformationHeader + 4, limit) !== indexCount
  ) {
    return null
  }

  const arrays = parseGeometryArrays(
    reader,
    embeddedHeader + 8,
    baseEnd,
    vertexCount,
    indexCount,
  )
  if (!arrays) return null
  const deformationVectors = reader.float32Array(
    deformationHeader + 8,
    deformationFloatCount,
    limit,
  )
  if (!deformationVectors || !isPlausibleFloatArray(deformationVectors)) {
    return null
  }

  const uvFrames: Float32Array[] = [arrays.uvs.slice()]
  for (let index = 0; index < spriteCount - 1; index += 1) {
    const record = atlasOffset + index * atlasRecordSize
    if (
      reader.uint32(record, limit) !== vertexCount ||
      reader.uint32(record + 4, limit) !== indexCount
    ) {
      return null
    }
    const uvs = reader.float32Array(record + 8, vertexCount * 2, limit)
    const tail = reader.slice(record + 8 + vertexCount * 8, 8, limit)
    if (
      !uvs ||
      !isPlausibleFloatArray(uvs) ||
      !tail ||
      tail.some((value) => value !== 0)
    ) {
      return null
    }
    uvFrames.push(uvs)
  }

  const animation: GxSpriteAnimation = {
    uvFrames,
    timelineIndices,
    deformationVectors,
  }
  return withMetadata(arrays, { variant: 'sprite', spriteCount, animation })
}

function parseType7Geometry(
  reader: BinaryReader,
  payload: number,
  limit: number,
) {
  if (reader.uint8(payload, limit) !== 7) return null
  const firstCount = reader.uint32(payload + 1, limit)
  const tableCount = reader.uint32(payload + 5, limit)
  if (
    firstCount === null ||
    tableCount === null ||
    firstCount <= 0 ||
    firstCount >= MAX_TABLE_COUNT ||
    tableCount <= 0 ||
    tableCount >= MAX_TABLE_COUNT
  ) {
    return null
  }
  const table = reader.uint32Array(payload + 9, tableCount, limit)
  if (!table) return null
  const embeddedHeader = payload + 9 + tableCount * 4
  const vertexCount = reader.uint32(embeddedHeader, limit)
  const indexCount = reader.uint32(embeddedHeader + 4, limit)
  if (vertexCount === null || indexCount === null) return null
  return withMetadata(
    parseGeometryArrays(
      reader,
      embeddedHeader + 8,
      limit,
      vertexCount,
      indexCount,
    ),
    { variant: 'type7', firstCount, table },
  )
}

function parseGeometry(
  reader: BinaryReader,
  payload: number,
  limit: number,
) {
  return (
    parseStandardGeometry(reader, payload, limit) ??
    parseTableGeometry(reader, payload, limit) ??
    parseSpriteGeometry(reader, payload, limit) ??
    parseType7Geometry(reader, payload, limit)
  )
}

export function textureReferenceImpliesAlpha(texture: string | null) {
  if (!texture) return false
  const filename = texture.replaceAll('\\', '/').split('/').at(-1) ?? texture
  const dot = filename.lastIndexOf('.')
  const stem = (dot > 0 ? filename.slice(0, dot) : filename).toLowerCase()
  return stem.startsWith('a_alp') || stem.includes('_alp') || stem.startsWith('alp')
}

export function materialImpliesBlackBackgroundBlend(
  material: GxMaterial | null,
) {
  if (!material || material.raw.length < 8) return false
  return (
    material.raw[0] !== 1 &&
    material.raw[1] > 0 &&
    material.raw.slice(2).every((value) => value === 0)
  )
}

export function materialImpliesBlendAlpha(material: GxMaterial | null) {
  return Boolean(material && (material.flags & 0xff) !== 0)
}

export function meshUsesBlackBlendTexture(
  texture: string | null,
  material: GxMaterial | null,
) {
  if (!texture || textureReferenceImpliesAlpha(texture)) return false
  return (
    materialImpliesBlackBackgroundBlend(material) ||
    materialImpliesBlendAlpha(material)
  )
}

function diagnostic(
  diagnostics: GxParseDiagnostic[],
  code: string,
  message: string,
  offset: number,
) {
  diagnostics.push({ level: 'warning', code, message, offset })
}

export function parseGx(buffer: ArrayBuffer): GxParseResult {
  const reader = new BinaryReader(buffer)
  const markers = scanChunkMarkers(reader)
  if (markers.length === 0) {
    throw new GxParseError('NO_CHUNKS', 'GX 청크 마커를 찾지 못했습니다.', 0)
  }

  const frames: MutableFrame[] = []
  const meshes: GxMesh[] = []
  const diagnostics: GxParseDiagnostic[] = []
  const frameStack: number[] = []
  const chunkStack: string[] = []
  let currentTexture: string | null = null
  let currentMaterial: GxMaterial | null = null
  let currentFrameIndex: number | null = null

  for (let index = 0; index < markers.length; index += 1) {
    const marker = markers[index]
    const nextOffset = markers[index + 1]?.start ?? reader.byteLength

    if (marker.token === CLOSE_TOKEN) {
      const closed = chunkStack.pop()
      if (closed === FRAME_TOKEN) frameStack.pop()
      currentFrameIndex = frameStack.at(-1) ?? currentFrameIndex
      continue
    }
    if (!marker.hasPayload) continue
    if (STRUCTURAL_TOKENS.has(marker.token)) chunkStack.push(marker.token)

    if (marker.token === TEXTURE_TOKEN) {
      const texture = parseSizedString(reader, marker.end, nextOffset)
      if (texture) currentTexture = texture
      else diagnostic(
        diagnostics,
        'INVALID_TEXTURE_CHUNK',
        '텍스처 참조 청크를 읽지 못했습니다.',
        marker.start,
      )
      continue
    }

    if (marker.token === MATERIAL_TOKEN) {
      const material = parseMaterial(reader, marker.end, nextOffset)
      if (material) currentMaterial = material
      else diagnostic(
        diagnostics,
        'INVALID_MATERIAL_CHUNK',
        '재질 청크를 읽지 못했습니다.',
        marker.start,
      )
      continue
    }

    if (marker.token === FRAME_TOKEN) {
      const parsed = parseFrame(reader, marker.end, nextOffset)
      if (!parsed) {
        diagnostic(
          diagnostics,
          'INVALID_FRAME_CHUNK',
          '프레임 이름 또는 행렬을 읽지 못했습니다.',
          marker.start,
        )
        continue
      }
      const parentIndex = frameStack.at(-1) ?? null
      const parentWorld =
        parentIndex === null ? GX_IDENTITY_MATRIX : frames[parentIndex].worldMatrix
      const frame: MutableFrame = {
        index: frames.length,
        name: parsed.name,
        parentIndex,
        localMatrix: parsed.matrix,
        worldMatrix: multiplyMatrices(parentWorld, parsed.matrix),
        keyframes: null,
      }
      frames.push(frame)
      currentFrameIndex = frame.index
      frameStack.push(frame.index)
      continue
    }

    if (marker.token === KEYFRAME_TOKEN) {
      const block = parseKeyframeBlock(reader, marker.end, nextOffset)
      const targetIndex = frameStack.at(-1) ?? currentFrameIndex
      if (!block || targetIndex === null) {
        diagnostic(
          diagnostics,
          'INVALID_KEYFRAME_CHUNK',
          '키프레임 청크 또는 대상 프레임을 읽지 못했습니다.',
          marker.start,
        )
        continue
      }
      const frame = frames[targetIndex]
      const parentWorld =
        frame.parentIndex === null
          ? GX_IDENTITY_MATRIX
          : frames[frame.parentIndex].worldMatrix
      frame.keyframes = block
      frame.localMatrix = block.matrices[0]
      frame.worldMatrix = multiplyMatrices(parentWorld, block.matrices[0])
      continue
    }

    if (marker.token === GEOMETRY_TOKEN) {
      const geometry = parseGeometry(reader, marker.end, nextOffset)
      if (!geometry) {
        diagnostic(
          diagnostics,
          'UNSUPPORTED_GEOMETRY_CHUNK',
          '지원하지 않거나 손상된 지오메트리 청크를 건너뜁니다.',
          marker.start,
        )
        continue
      }
      const frameIndex = frameStack.at(-1) ?? currentFrameIndex
      const frame = frameIndex === null ? null : frames[frameIndex]
      const textureImpliesAlpha = textureReferenceImpliesAlpha(currentTexture)
      const materialImpliesAlpha = materialImpliesBlendAlpha(currentMaterial)
      const usesBlackBlendTexture = meshUsesBlackBlendTexture(
        currentTexture,
        currentMaterial,
      )
      meshes.push({
        index: meshes.length,
        name: `mesh_${String(meshes.length).padStart(3, '0')}`,
        frameIndex,
        frameName: frame?.name ?? null,
        texture: currentTexture,
        textureImpliesAlpha,
        materialImpliesAlpha,
        usesBlackBlendTexture,
        requiresAlpha: textureImpliesAlpha || usesBlackBlendTexture,
        material: currentMaterial,
        transform: frame?.worldMatrix ?? GX_IDENTITY_MATRIX,
        geometry,
      })
    }
  }

  if (meshes.length === 0) {
    diagnostic(
      diagnostics,
      'NO_SUPPORTED_GEOMETRY',
      '지원되는 지오메트리를 찾지 못했습니다.',
      0,
    )
  }

  return {
    parserVersion: GX_PARSER_VERSION,
    byteLength: reader.byteLength,
    chunkCount: markers.length,
    frames: frames as readonly GxFrame[],
    meshes,
    diagnostics,
  }
}
