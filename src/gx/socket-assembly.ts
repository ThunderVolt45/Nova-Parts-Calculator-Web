import type {
  GxFrame,
  GxMatrix,
  GxParseResult,
  XfiParseResult,
} from './parser/types.ts'

export const UNIT_WEAPON_SOCKET_INDEX = 2

export type GltfMatrix = GxMatrix

export interface PartSocketMetadata {
  readonly primaryFrameName: string | null
  readonly primaryFrameIndex?: number | null
  readonly primaryFrameTransform: GxMatrix
  readonly xfi: {
    readonly partType: number | null
    readonly sockets: readonly GxMatrix[]
  } | null
}

export interface UnitSocketAssembly {
  readonly bodyTransform: GltfMatrix
  readonly weaponTransform: GltfMatrix
  readonly bodySocket: GxMatrix
  readonly weaponSocket: GxMatrix
  readonly weaponSocketIndex: typeof UNIT_WEAPON_SOCKET_INDEX
  readonly legsPrimaryFrame: string | null
  readonly bodyPrimaryFrame: string | null
}

export interface PartialUnitSocketAssembly {
  readonly bodyTransform: GltfMatrix
  readonly weaponTransform: GltfMatrix
  readonly bodySocket: GltfMatrix | null
  readonly weaponSocket: GltfMatrix | null
  readonly legsPrimaryFrame: string | null
  readonly legsPrimaryFrameIndex: number | null
  readonly bodyPrimaryFrame: string | null
  readonly bodyPrimaryFrameIndex: number | null
  readonly bodyAttached: boolean
  readonly weaponAttached: boolean
  readonly diagnostics: readonly string[]
}

export class UnitSocketAssemblyError extends Error {
  readonly code:
    | 'LEGS_XFI_MISSING'
    | 'LEGS_XFI_TYPE'
    | 'LEGS_SOCKET_MISSING'
    | 'BODY_XFI_MISSING'
    | 'BODY_XFI_TYPE'
    | 'BODY_SOCKET_MISSING'

  constructor(code: UnitSocketAssemblyError['code'], message: string) {
    super(message)
    this.name = 'UnitSocketAssemblyError'
    this.code = code
  }
}

const identity: GxMatrix = [
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
]

function multiplyGxMatrices(left: GxMatrix, right: GxMatrix): GxMatrix {
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

function staticFrameMatrix(frame: GxFrame) {
  return frame.keyframes?.matrices[0] ?? frame.localMatrix
}

function primaryFrameStaticTransform(parsed: GxParseResult) {
  if (parsed.frames.length === 0) {
    return { index: null, name: null, transform: identity }
  }
  const target = parsed.frames.find(
    (frame) => (frame.keyframes?.matrices.length ?? 0) > 0,
  ) ?? parsed.frames[Math.min(1, parsed.frames.length - 1)]
  const lineage: GxFrame[] = []
  const visited = new Set<number>()
  let cursor: GxFrame | undefined = target
  while (cursor) {
    if (visited.has(cursor.index)) {
      throw new Error('GX 프레임 계층에 순환 참조가 있습니다.')
    }
    visited.add(cursor.index)
    lineage.push(cursor)
    cursor = cursor.parentIndex === null
      ? undefined
      : parsed.frames[cursor.parentIndex]
  }
  let transform = identity
  for (const frame of lineage.reverse()) {
    transform = multiplyGxMatrices(transform, staticFrameMatrix(frame))
  }
  return { index: target.index, name: target.name, transform }
}

export function describePartSockets(
  parsed: GxParseResult,
  xfi: XfiParseResult | null,
): PartSocketMetadata {
  const primary = primaryFrameStaticTransform(parsed)
  return {
    primaryFrameName: primary.name,
    primaryFrameIndex: primary.index,
    primaryFrameTransform: primary.transform,
    xfi: xfi
      ? { partType: xfi.partType, sockets: xfi.matrices }
      : null,
  }
}

export function gxMatrixToGltf(matrix: GxMatrix): GltfMatrix {
  return [
    matrix[0], matrix[4], matrix[8], matrix[12],
    matrix[1], matrix[5], matrix[9], matrix[13],
    matrix[2], matrix[6], matrix[10], matrix[14],
    matrix[3], matrix[7], matrix[11], matrix[15],
  ]
}

function multiplyGltfMatrices(left: GltfMatrix, right: GltfMatrix): GltfMatrix {
  const result = new Array<number>(16).fill(0)
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      for (let index = 0; index < 4; index += 1) {
        result[column * 4 + row] +=
          left[index * 4 + row] * right[column * 4 + index]
      }
    }
  }
  return result as unknown as GltfMatrix
}

function requireLegSocket(metadata: PartSocketMetadata) {
  if (!metadata.xfi) {
    throw new UnitSocketAssemblyError(
      'LEGS_XFI_MISSING',
      '다리의 XFI 소켓 파일을 찾지 못했습니다.',
    )
  }
  if (metadata.xfi.partType !== 0) {
    throw new UnitSocketAssemblyError(
      'LEGS_XFI_TYPE',
      `다리 XFI 타입 0이 필요하지만 ${metadata.xfi.partType ?? '숫자 아님'}입니다.`,
    )
  }
  const socket = metadata.xfi.sockets[0]
  if (!socket) {
    throw new UnitSocketAssemblyError(
      'LEGS_SOCKET_MISSING',
      '다리 XFI의 몸통 소켓 0을 찾지 못했습니다.',
    )
  }
  return socket
}

function requireWeaponSocket(metadata: PartSocketMetadata) {
  if (!metadata.xfi) {
    throw new UnitSocketAssemblyError(
      'BODY_XFI_MISSING',
      '몸통의 XFI 소켓 파일을 찾지 못했습니다.',
    )
  }
  if (metadata.xfi.partType !== 1) {
    throw new UnitSocketAssemblyError(
      'BODY_XFI_TYPE',
      `몸통 XFI 타입 1이 필요하지만 ${metadata.xfi.partType ?? '숫자 아님'}입니다.`,
    )
  }
  const socket = metadata.xfi.sockets[UNIT_WEAPON_SOCKET_INDEX]
  if (!socket) {
    throw new UnitSocketAssemblyError(
      'BODY_SOCKET_MISSING',
      `몸통 XFI의 무기 소켓 ${UNIT_WEAPON_SOCKET_INDEX}을 찾지 못했습니다.`,
    )
  }
  return socket
}

export function buildUnitSocketAssembly(
  legs: PartSocketMetadata,
  body: PartSocketMetadata,
): UnitSocketAssembly {
  const bodySocket = requireLegSocket(legs)
  const weaponSocket = requireWeaponSocket(body)
  const legsPrimary = gxMatrixToGltf(legs.primaryFrameTransform)
  const bodyPrimary = gxMatrixToGltf(body.primaryFrameTransform)
  const bodyTransform = multiplyGltfMatrices(legsPrimary, bodySocket)
  const weaponTransform = multiplyGltfMatrices(
    bodyTransform,
    multiplyGltfMatrices(bodyPrimary, weaponSocket),
  )
  return {
    bodyTransform,
    weaponTransform,
    bodySocket,
    weaponSocket,
    weaponSocketIndex: UNIT_WEAPON_SOCKET_INDEX,
    legsPrimaryFrame: legs.primaryFrameName,
    bodyPrimaryFrame: body.primaryFrameName,
  }
}

export function buildPartialUnitSocketAssembly(
  legs: PartSocketMetadata | null,
  body: PartSocketMetadata | null,
): PartialUnitSocketAssembly {
  const diagnostics: string[] = []
  let bodyTransform: GltfMatrix = identity
  let bodySocket: GltfMatrix | null = null
  let bodyAttached = false

  if (legs) {
    try {
      bodySocket = requireLegSocket(legs)
      bodyTransform = multiplyGltfMatrices(
        gxMatrixToGltf(legs.primaryFrameTransform),
        bodySocket,
      )
      bodyAttached = true
    } catch (error) {
      diagnostics.push(error instanceof Error ? error.message : '다리 소켓을 확인하지 못했습니다.')
    }
  } else {
    diagnostics.push('다리가 없어 몸통을 원점에 표시합니다.')
  }

  let weaponTransform: GltfMatrix = identity
  let weaponSocket: GltfMatrix | null = null
  let weaponAttached = false
  if (body) {
    try {
      weaponSocket = requireWeaponSocket(body)
      weaponTransform = multiplyGltfMatrices(
        bodyTransform,
        multiplyGltfMatrices(
          gxMatrixToGltf(body.primaryFrameTransform),
          weaponSocket,
        ),
      )
      weaponAttached = true
    } catch (error) {
      diagnostics.push(error instanceof Error ? error.message : '몸통 소켓을 확인하지 못했습니다.')
    }
  } else {
    weaponTransform = bodyTransform
    weaponAttached = bodyAttached
    diagnostics.push(bodyAttached
      ? '몸통이 없어 무기를 다리의 몸통 소켓에 표시합니다.'
      : '몸통과 유효한 다리 소켓이 없어 무기를 원점에 표시합니다.')
  }

  return {
    bodyTransform,
    weaponTransform,
    bodySocket,
    weaponSocket,
    legsPrimaryFrame: legs?.primaryFrameName ?? null,
    legsPrimaryFrameIndex: legs?.primaryFrameIndex ?? null,
    bodyPrimaryFrame: body?.primaryFrameName ?? null,
    bodyPrimaryFrameIndex: body?.primaryFrameIndex ?? null,
    bodyAttached,
    weaponAttached,
    diagnostics,
  }
}

export function transformGltfPoint(
  matrix: GltfMatrix,
  point: readonly [number, number, number],
) {
  const [x, y, z] = point
  return [
    matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
    matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
    matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14],
  ] as const
}
