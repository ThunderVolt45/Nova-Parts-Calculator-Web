export type GxMatrix = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
]

export type GxGeometryVariant = 'standard' | 'table' | 'sprite' | 'type7'

export interface GxParseDiagnostic {
  readonly level: 'warning'
  readonly code: string
  readonly message: string
  readonly offset: number
}

export interface GxMaterial {
  readonly unknown0: number
  readonly unknown1: number
  readonly ambient: number
  readonly diffuse: number
  readonly specular: number
  readonly emissive: number
  readonly extra: number
  readonly flags: number
  readonly raw: readonly number[]
}

export interface GxKeyframeBlock {
  readonly matrices: readonly GxMatrix[]
  readonly timelineIndices: Uint16Array
}

export interface GxFrame {
  readonly index: number
  readonly name: string | null
  readonly parentIndex: number | null
  readonly localMatrix: GxMatrix
  readonly worldMatrix: GxMatrix
  readonly keyframes: GxKeyframeBlock | null
}

export interface GxSpriteAnimation {
  readonly uvFrames: readonly Float32Array[]
  readonly timelineIndices: Uint32Array
  readonly deformationVectors: Float32Array
}

export type GxGeometryMetadata =
  | {
      readonly variant: 'standard'
      readonly unknown0: number
      readonly unknown1: number
    }
  | {
      readonly variant: 'table'
      readonly tableType: 1 | 6
      readonly unknownCount: number
      readonly table: Uint32Array
    }
  | {
      readonly variant: 'type7'
      readonly firstCount: number
      readonly table: Uint32Array
    }
  | {
      readonly variant: 'sprite'
      readonly spriteCount: number
      readonly animation: GxSpriteAnimation
    }

export interface GxGeometry {
  readonly positions: Float32Array
  readonly normals: Float32Array
  readonly uvs: Float32Array
  readonly indices: Uint32Array
  readonly sourceIndexBase: 0 | 1
  readonly metadata: GxGeometryMetadata
}

export interface GxMesh {
  readonly index: number
  readonly name: string
  readonly frameIndex: number | null
  readonly frameName: string | null
  readonly texture: string | null
  readonly textureImpliesAlpha: boolean
  readonly materialImpliesAlpha: boolean
  readonly usesBlackBlendTexture: boolean
  readonly requiresAlpha: boolean
  readonly material: GxMaterial | null
  readonly transform: GxMatrix
  readonly geometry: GxGeometry
}

export interface GxParseResult {
  readonly parserVersion: string
  readonly byteLength: number
  readonly chunkCount: number
  readonly frames: readonly GxFrame[]
  readonly meshes: readonly GxMesh[]
  readonly diagnostics: readonly GxParseDiagnostic[]
}

export interface XfiAnimationRange {
  readonly animationId: number
  readonly start: number
  readonly end: number
  readonly clip: 'idle' | 'move' | 'attack' | 'unknown'
}

export interface XfiParseResult {
  readonly partType: number | null
  readonly matrices: readonly GxMatrix[]
  readonly animationRanges: readonly XfiAnimationRange[]
  readonly diagnostics: readonly GxParseDiagnostic[]
}

export interface XfiParseOptions {
  readonly expectedPartType?: number
  readonly socketCount?: number
}
