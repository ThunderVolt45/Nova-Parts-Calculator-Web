import { GxParseError } from './binary.ts'
import type {
  GxMatrix,
  GxParseDiagnostic,
  XfiAnimationRange,
  XfiParseOptions,
  XfiParseResult,
} from './types.ts'

interface TextRow {
  readonly text: string
  readonly line: number
}

function rowsFromText(text: string) {
  return text
    .split(/\r?\n/)
    .map((value, index): TextRow => ({ text: value.trim(), line: index + 1 }))
    .filter((row) => row.text.length > 0)
}

function parseUnsignedInteger(value: string) {
  const text = value.replace(/,$/, '').trim()
  if (!/^\d+$/.test(text)) return null
  const parsed = Number(text)
  return Number.isSafeInteger(parsed) ? parsed : null
}

function parseFloatRow(value: string) {
  const parts = value
    .replace(/,$/, '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
  if (parts.length !== 4) return null
  const values = parts.map(Number)
  return values.every(Number.isFinite) ? values : null
}

function parseMatrix(rows: readonly TextRow[], start: number): GxMatrix | null {
  if (start < 0 || start + 4 > rows.length) return null
  const parsed = rows.slice(start, start + 4).map((row) => parseFloatRow(row.text))
  if (parsed.some((row) => row === null)) return null
  return parsed.flat() as unknown as GxMatrix
}

function clipForAnimationId(animationId: number): XfiAnimationRange['clip'] {
  if (animationId === 0) return 'idle'
  if ([1, 2, 4, 6].includes(animationId)) return 'move'
  if (animationId === 3) return 'attack'
  return 'unknown'
}

function parseAnimationRange(value: string): XfiAnimationRange | null {
  const parts = value
    .replace(/,$/, '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
  if (parts.length !== 3 || parts.some((part) => !/^\d+$/.test(part))) {
    return null
  }
  const [animationId, start, end] = parts.map(Number)
  if (animationId > 100 || start > end || end > 10_000) return null
  return { animationId, start, end, clip: clipForAnimationId(animationId) }
}

function parseAnimationRanges(rows: readonly TextRow[]) {
  for (let index = 0; index < rows.length; index += 1) {
    const count = parseUnsignedInteger(rows[index].text)
    if (count === null || count <= 0 || count > 1000) continue
    if (index + 1 + count > rows.length) continue
    const ranges = rows
      .slice(index + 1, index + 1 + count)
      .map((row) => parseAnimationRange(row.text))
    if (ranges.every((range) => range !== null)) {
      return ranges as XfiAnimationRange[]
    }
  }
  return []
}

function warning(
  code: string,
  message: string,
  line = 1,
): GxParseDiagnostic {
  return { level: 'warning', code, message, offset: line }
}

export function parseXfi(
  text: string,
  options: XfiParseOptions = {},
): XfiParseResult {
  const rows = rowsFromText(text)
  if (rows.length === 0) {
    throw new GxParseError('EMPTY_XFI', 'XFI 파일이 비어 있습니다.', 0)
  }

  const partType = parseUnsignedInteger(rows[0].text)
  if (
    options.expectedPartType !== undefined &&
    partType !== options.expectedPartType
  ) {
    throw new GxParseError(
      'UNEXPECTED_XFI_TYPE',
      `XFI 타입 ${options.expectedPartType}이 필요하지만 ${partType ?? '숫자 아님'}입니다.`,
      rows[0].line,
    )
  }

  const matrices: GxMatrix[] = []
  const diagnostics: GxParseDiagnostic[] = []
  if (options.socketCount !== undefined) {
    if (partType === null) {
      throw new GxParseError(
        'INVALID_XFI_TYPE',
        '유닛 XFI의 첫 줄이 숫자 타입이 아닙니다.',
        rows[0].line,
      )
    }
    if (options.socketCount < 0 || options.socketCount > 64) {
      throw new GxParseError(
        'INVALID_SOCKET_COUNT',
        `지원하지 않는 XFI 소켓 수입니다: ${options.socketCount}`,
        rows[0].line,
      )
    }
    for (let index = 0; index < options.socketCount; index += 1) {
      const start = 1 + index * 4
      const matrix = parseMatrix(rows, start)
      if (!matrix) {
        throw new GxParseError(
          'INVALID_SOCKET_MATRIX',
          `XFI 소켓 행렬 ${index}을(를) 읽지 못했습니다.`,
          rows[start]?.line ?? rows.at(-1)?.line ?? 1,
        )
      }
      matrices.push(matrix)
    }
  } else {
    const preferredStart = partType === null ? 0 : 1
    let foundStart = -1
    for (let index = preferredStart; index + 4 <= rows.length; index += 1) {
      if (parseMatrix(rows, index)) {
        foundStart = index
        break
      }
    }
    if (foundStart >= 0) {
      for (let cursor = foundStart; cursor + 4 <= rows.length; cursor += 4) {
        const matrix = parseMatrix(rows, cursor)
        if (!matrix) break
        matrices.push(matrix)
      }
    }
  }

  const animationRanges = parseAnimationRanges(rows)
  if (matrices.length === 0) {
    diagnostics.push(
      warning('NO_XFI_MATRIX', 'XFI에서 4×4 행렬을 찾지 못했습니다.'),
    )
  }
  if (animationRanges.length === 0) {
    diagnostics.push(
      warning(
        'NO_XFI_ANIMATION_RANGES',
        'XFI에서 애니메이션 범위를 찾지 못했습니다.',
      ),
    )
  }

  return { partType, matrices, animationRanges, diagnostics }
}

