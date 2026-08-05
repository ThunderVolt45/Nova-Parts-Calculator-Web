import type {
  GxFrame,
  GxMaterial,
  GxMatrix,
  GxMesh,
  GxParseResult,
  XfiParseResult,
} from './parser/types.ts'
import {
  applyBlackAdditiveAlpha,
  decodeBmp,
  decodeTextureWithBrowser,
  decodeTga,
  encodeCompressedRgbaPng,
  textureHasTransparency,
  type DecodedTexture,
} from './texture-codec.ts'

const COMPONENT_FLOAT = 5126
const COMPONENT_UNSIGNED_SHORT = 5123
const COMPONENT_UNSIGNED_INT = 5125
const ARRAY_BUFFER = 34962
const ELEMENT_ARRAY_BUFFER = 34963
const DEFAULT_ANIMATION_FPS = 30

type JsonObject = Record<string, unknown>

export interface GxTextureInput {
  readonly reference: string
  readonly fileName: string
  readonly buffer: ArrayBuffer
  readonly mimeType?: string
}

export interface GlbConversionOptions {
  readonly sourceName: string
  readonly textures?: readonly GxTextureInput[]
  readonly xfi?: XfiParseResult | null
  readonly animationFps?: number
  readonly decodeTexture?: (
    input: GxTextureInput,
    mimeType: string,
  ) => Promise<DecodedTexture>
}

export interface GlbConversionDiagnostic {
  readonly code: 'MISSING_TEXTURE' | 'UNSUPPORTED_TEXTURE'
  readonly texture: string
  readonly message: string
}

export interface GlbConversionMetadata {
  readonly formatVersion: 1
  readonly parserVersion: string
  readonly sourceName: string
  readonly meshCount: number
  readonly frameCount: number
  readonly animationNames: readonly string[]
  readonly textureReferences: readonly string[]
  readonly missingTextures: readonly string[]
  readonly diagnostics: readonly GlbConversionDiagnostic[]
}

export interface GlbConversionResult {
  readonly glb: ArrayBuffer
  readonly metadata: GlbConversionMetadata
}

interface AccessorOptions {
  readonly componentType: number
  readonly type: 'SCALAR' | 'VEC2' | 'VEC3' | 'VEC4'
  readonly count: number
  readonly target?: number
  readonly min?: readonly number[]
  readonly max?: readonly number[]
}

class BinaryBuilder {
  readonly bufferViews: JsonObject[] = []
  readonly accessors: JsonObject[] = []
  readonly #parts: Uint8Array[] = []
  #length = 0

  align(boundary = 4) {
    const padding = (boundary - this.#length % boundary) % boundary
    if (padding > 0) this.append(new Uint8Array(padding))
  }

  append(bytes: Uint8Array) {
    this.#parts.push(bytes)
    this.#length += bytes.byteLength
  }

  addView(payload: Uint8Array, target?: number) {
    this.align()
    const byteOffset = this.#length
    this.append(payload)
    const view: JsonObject = {
      buffer: 0,
      byteOffset,
      byteLength: payload.byteLength,
    }
    if (target !== undefined) view.target = target
    this.bufferViews.push(view)
    return this.bufferViews.length - 1
  }

  addAccessor(payload: Uint8Array, options: AccessorOptions) {
    const bufferView = this.addView(payload, options.target)
    const accessor: JsonObject = {
      bufferView,
      componentType: options.componentType,
      count: options.count,
      type: options.type,
    }
    if (options.min) accessor.min = [...options.min]
    if (options.max) accessor.max = [...options.max]
    this.accessors.push(accessor)
    return this.accessors.length - 1
  }

  finish() {
    this.align()
    const result = new Uint8Array(this.#length)
    let offset = 0
    for (const part of this.#parts) {
      result.set(part, offset)
      offset += part.byteLength
    }
    return result
  }
}

function normalizedName(value: string) {
  return value.replaceAll('\\', '/').split('/').at(-1)?.normalize('NFC').toLowerCase() ?? value
}

function sourceStem(value: string) {
  const name = value.replaceAll('\\', '/').split('/').at(-1) ?? value
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(0, dot) : name
}

function extension(value: string) {
  const name = normalizedName(value)
  const dot = name.lastIndexOf('.')
  return dot >= 0 ? name.slice(dot) : ''
}

function textureMimeType(input: GxTextureInput) {
  if (input.mimeType) return input.mimeType
  if (extension(input.fileName) === '.png') return 'image/png'
  if (['.jpg', '.jpeg'].includes(extension(input.fileName))) return 'image/jpeg'
  if (extension(input.fileName) === '.bmp') return 'image/bmp'
  if (extension(input.fileName) === '.tga') return 'image/x-tga'
  return 'application/octet-stream'
}

function bytesOf(buffer: ArrayBuffer) {
  return new Uint8Array(buffer)
}

function packFloat32(values: ArrayLike<number>) {
  const bytes = new Uint8Array(values.length * 4)
  const view = new DataView(bytes.buffer)
  for (let index = 0; index < values.length; index += 1) {
    view.setFloat32(index * 4, values[index], true)
  }
  return bytes
}

function packIndices(values: Uint32Array) {
  let maximum = 0
  for (const value of values) maximum = Math.max(maximum, value)
  if (maximum <= 0xffff) {
    const bytes = new Uint8Array(values.length * 2)
    const view = new DataView(bytes.buffer)
    for (let index = 0; index < values.length; index += 1) {
      view.setUint16(index * 2, values[index], true)
    }
    return { bytes, componentType: COMPONENT_UNSIGNED_SHORT }
  }
  const bytes = new Uint8Array(values.length * 4)
  const view = new DataView(bytes.buffer)
  for (let index = 0; index < values.length; index += 1) {
    view.setUint32(index * 4, values[index], true)
  }
  return { bytes, componentType: COMPONENT_UNSIGNED_INT }
}

function vec3Bounds(values: Float32Array) {
  const minimum = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY]
  const maximum = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY]
  for (let offset = 0; offset < values.length; offset += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      minimum[axis] = Math.min(minimum[axis], values[offset + axis])
      maximum[axis] = Math.max(maximum[axis], values[offset + axis])
    }
  }
  return { minimum, maximum }
}

function normalizeQuaternion(values: readonly number[]) {
  const length = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0))
  return length <= 0 ? [0, 0, 0, 1] : values.map((value) => value / length)
}

function quaternionFromRows(rows: readonly (readonly number[])[]) {
  const [[m00, m01, m02], [m10, m11, m12], [m20, m21, m22]] = rows
  const trace = m00 + m11 + m22
  if (trace > 0) {
    const scale = Math.sqrt(trace + 1) * 2
    return normalizeQuaternion([
      (m21 - m12) / scale,
      (m02 - m20) / scale,
      (m10 - m01) / scale,
      0.25 * scale,
    ])
  }
  if (m00 > m11 && m00 > m22) {
    const scale = Math.sqrt(1 + m00 - m11 - m22) * 2
    return normalizeQuaternion([
      0.25 * scale,
      (m01 + m10) / scale,
      (m02 + m20) / scale,
      (m21 - m12) / scale,
    ])
  }
  if (m11 > m22) {
    const scale = Math.sqrt(1 + m11 - m00 - m22) * 2
    return normalizeQuaternion([
      (m01 + m10) / scale,
      0.25 * scale,
      (m12 + m21) / scale,
      (m02 - m20) / scale,
    ])
  }
  const scale = Math.sqrt(1 + m22 - m00 - m11) * 2
  return normalizeQuaternion([
    (m02 + m20) / scale,
    (m12 + m21) / scale,
    0.25 * scale,
    (m10 - m01) / scale,
  ])
}

function decomposeGxMatrix(matrix: GxMatrix) {
  const rows = [
    [matrix[0], matrix[1], matrix[2]],
    [matrix[4], matrix[5], matrix[6]],
    [matrix[8], matrix[9], matrix[10]],
  ]
  const scale = [0, 1, 2].map((column) => Math.sqrt(
    rows.reduce((sum, row) => sum + row[column] * row[column], 0),
  ))
  const rotationRows = rows.map((row, rowIndex) => row.map((value, column) =>
    scale[column] <= 1e-8 ? (rowIndex === column ? 1 : 0) : value / scale[column],
  ))
  return {
    translation: [matrix[3], matrix[7], matrix[11]],
    rotation: quaternionFromRows(rotationRows),
    scale,
  }
}

function frameNode(frame: GxFrame) {
  const transform = decomposeGxMatrix(frame.localMatrix)
  const node: JsonObject = {
    name: frame.name ?? `frame_${String(frame.index).padStart(3, '0')}`,
    ...transform,
    extras: {
      gxFrameIndex: frame.index,
      ...(frame.keyframes
        ? {
            gxAnimation: {
              matrixCount: frame.keyframes.matrices.length,
              timelineSampleCount: frame.keyframes.timelineIndices.length,
              timelineKeyIndices: Array.from(frame.keyframes.timelineIndices),
            },
          }
        : {}),
    },
  }
  return node
}

function materialHex(value: number) {
  return `0x${value.toString(16).toUpperCase().padStart(8, '0')}`
}

function materialExtras(material: GxMaterial | null) {
  if (!material) return undefined
  return {
    gxMaterial: {
      ambient: materialHex(material.ambient),
      diffuse: materialHex(material.diffuse),
      specular: materialHex(material.specular),
      emissive: materialHex(material.emissive),
      extra: materialHex(material.extra),
      flags: materialHex(material.flags),
      raw: material.raw.map(materialHex),
    },
  }
}

function alphaCutoutWheelAtlasRegion(mesh: GxMesh) {
  if (!mesh.texture) return false
  const stem = sourceStem(mesh.texture).toLowerCase()
  if (stem !== 'a_alp2_2' && stem !== 'a_alp2_7') return false
  let minU = Number.POSITIVE_INFINITY
  let maxU = Number.NEGATIVE_INFINITY
  let minV = Number.POSITIVE_INFINITY
  let maxV = Number.NEGATIVE_INFINITY
  for (let offset = 0; offset < mesh.geometry.uvs.length; offset += 2) {
    minU = Math.min(minU, mesh.geometry.uvs[offset])
    maxU = Math.max(maxU, mesh.geometry.uvs[offset])
    minV = Math.min(minV, mesh.geometry.uvs[offset + 1])
    maxV = Math.max(maxV, mesh.geometry.uvs[offset + 1])
  }
  return minU >= -0.05 && maxU <= 0.3 && minV >= 0.2 && maxV <= 1.05
}

async function defaultDecodeTexture(input: GxTextureInput, mimeType: string) {
  const suffix = extension(input.fileName)
  if (suffix === '.tga') return decodeTga(input.buffer)
  if (suffix === '.bmp') return decodeBmp(input.buffer)
  return decodeTextureWithBrowser(input.buffer, mimeType)
}

interface TextureBuildResult {
  readonly images: JsonObject[]
  readonly textures: JsonObject[]
  readonly samplers: JsonObject[]
  readonly indices: Map<string, number>
  readonly blackBlendMeshes: Set<number>
}

async function buildTextures(
  builder: BinaryBuilder,
  meshes: readonly GxMesh[],
  inputs: readonly GxTextureInput[],
  diagnostics: GlbConversionDiagnostic[],
  decode: NonNullable<GlbConversionOptions['decodeTexture']>,
): Promise<TextureBuildResult> {
  const byReference = new Map<string, GxTextureInput>()
  const byName = new Map<string, GxTextureInput>()
  for (const input of inputs) {
    byReference.set(normalizedName(input.reference), input)
    byName.set(normalizedName(input.fileName), input)
  }
  const images: JsonObject[] = []
  const textures: JsonObject[] = []
  const indices = new Map<string, number>()
  const blackBlendMeshes = new Set<number>()
  const missing = new Set<string>()
  const decoded = new Map<GxTextureInput, Promise<DecodedTexture>>()
  const decodeInput = (input: GxTextureInput) => {
    let pending = decoded.get(input)
    if (!pending) {
      pending = decode(input, textureMimeType(input))
      decoded.set(input, pending)
    }
    return pending
  }

  const addTexture = (key: string, reference: string, payload: Uint8Array, mimeType: string) => {
    const imageIndex = images.length
    images.push({
      bufferView: builder.addView(payload),
      mimeType,
      extras: { gxTextureReference: reference },
    })
    const textureIndex = textures.length
    textures.push({ sampler: 0, source: imageIndex })
    indices.set(key, textureIndex)
  }

  for (const mesh of meshes) {
    if (!mesh.texture) continue
    const referenceKey = normalizedName(mesh.texture)
    const input = byReference.get(referenceKey) ?? byName.get(referenceKey)
    if (!input) {
      if (!missing.has(mesh.texture)) {
        missing.add(mesh.texture)
        diagnostics.push({
          code: 'MISSING_TEXTURE',
          texture: mesh.texture,
          message: `승인된 폴더에서 텍스처를 찾지 못했습니다: ${mesh.texture}`,
        })
      }
      continue
    }

    let blackBlend = mesh.usesBlackBlendTexture
    if (!blackBlend && mesh.textureImpliesAlpha) {
      try {
        blackBlend = !textureHasTransparency((await decodeInput(input)).pixels)
      } catch {
        blackBlend = false
      }
    }
    if (blackBlend) blackBlendMeshes.add(mesh.index)
    const textureKey = blackBlend ? `${referenceKey}#blackblend` : referenceKey
    if (indices.has(textureKey)) continue

    try {
      if (blackBlend) {
        const source = await decodeInput(input)
        addTexture(
          textureKey,
          mesh.texture,
          await encodeCompressedRgbaPng({
            ...source,
            pixels: applyBlackAdditiveAlpha(source.pixels),
          }),
          'image/png',
        )
        continue
      }

      const mimeType = textureMimeType(input)
      if (mimeType === 'image/png' || mimeType === 'image/jpeg') {
        addTexture(textureKey, mesh.texture, bytesOf(input.buffer), mimeType)
      } else {
        addTexture(
          textureKey,
          mesh.texture,
          await encodeCompressedRgbaPng(await decodeInput(input)),
          'image/png',
        )
      }
    } catch (error) {
      diagnostics.push({
        code: 'UNSUPPORTED_TEXTURE',
        texture: mesh.texture,
        message: error instanceof Error ? error.message : '텍스처를 변환하지 못했습니다.',
      })
    }
  }

  return {
    images,
    textures,
    samplers: textures.length > 0
      ? [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }]
      : [],
    indices,
    blackBlendMeshes,
  }
}

function materialKey(mesh: GxMesh, textureIndex: number | undefined, blackBlend: boolean) {
  return JSON.stringify({
    textureIndex,
    material: mesh.material?.raw ?? null,
    alpha: blackBlend || mesh.requiresAlpha,
    mask: alphaCutoutWheelAtlasRegion(mesh),
  })
}

function makeMaterial(
  mesh: GxMesh,
  textureIndex: number | undefined,
  blackBlend: boolean,
) {
  const pbr: JsonObject = {
    baseColorFactor: [1, 1, 1, 1],
    metallicFactor: 0,
    roughnessFactor: 1,
  }
  if (textureIndex !== undefined) pbr.baseColorTexture = { index: textureIndex }
  const material: JsonObject = {
    name: mesh.texture ? sourceStem(mesh.texture) : `material_${mesh.index}`,
    pbrMetallicRoughness: pbr,
    doubleSided: true,
  }
  const usesAlpha = blackBlend || mesh.requiresAlpha
  if (usesAlpha) {
    const mask = alphaCutoutWheelAtlasRegion(mesh)
    material.alphaMode = mask ? 'MASK' : 'BLEND'
    if (mask) material.alphaCutoff = 0.1
  }
  const extras: JsonObject = materialExtras(mesh.material) ?? {}
  if (mesh.textureImpliesAlpha) extras.gxAlphaTextureHint = mesh.texture
  if (blackBlend) extras.gxAlphaTextureVariant = 'black-background additive approximation PNG'
  if (Object.keys(extras).length > 0) material.extras = extras
  return material
}

function addMesh(
  builder: BinaryBuilder,
  gltfMeshes: JsonObject[],
  materials: JsonObject[],
  materialIndices: Map<string, number>,
  mesh: GxMesh,
  uvs: Float32Array,
  textureIndex: number | undefined,
  blackBlend: boolean,
) {
  const geometry = mesh.geometry
  const bounds = vec3Bounds(geometry.positions)
  const position = builder.addAccessor(packFloat32(geometry.positions), {
    componentType: COMPONENT_FLOAT,
    type: 'VEC3',
    count: geometry.positions.length / 3,
    target: ARRAY_BUFFER,
    min: bounds.minimum,
    max: bounds.maximum,
  })
  const normal = builder.addAccessor(packFloat32(geometry.normals), {
    componentType: COMPONENT_FLOAT,
    type: 'VEC3',
    count: geometry.normals.length / 3,
    target: ARRAY_BUFFER,
  })
  const texcoord = builder.addAccessor(packFloat32(uvs), {
    componentType: COMPONENT_FLOAT,
    type: 'VEC2',
    count: uvs.length / 2,
    target: ARRAY_BUFFER,
  })
  const packedIndices = packIndices(geometry.indices)
  const index = builder.addAccessor(packedIndices.bytes, {
    componentType: packedIndices.componentType,
    type: 'SCALAR',
    count: geometry.indices.length,
    target: ELEMENT_ARRAY_BUFFER,
  })
  const key = materialKey(mesh, textureIndex, blackBlend)
  let materialIndex = materialIndices.get(key)
  if (materialIndex === undefined) {
    materialIndex = materials.length
    materialIndices.set(key, materialIndex)
    materials.push(makeMaterial(mesh, textureIndex, blackBlend))
  }
  gltfMeshes.push({
    name: mesh.frameName ? `${mesh.name}_${mesh.frameName}` : mesh.name,
    primitives: [{
      attributes: { POSITION: position, NORMAL: normal, TEXCOORD_0: texcoord },
      indices: index,
      material: materialIndex,
    }],
    extras: { gxGeometryVariant: geometry.metadata.variant },
  })
  return gltfMeshes.length - 1
}

function appendChild(nodes: JsonObject[], parent: number, child: number) {
  const children = (nodes[parent].children as number[] | undefined) ?? []
  children.push(child)
  nodes[parent].children = children
}

interface SpriteBinding {
  readonly mesh: GxMesh
  readonly nodes: readonly number[]
}

function addAnimationSampler(
  builder: BinaryBuilder,
  animation: JsonObject,
  times: readonly number[],
  values: readonly number[],
  type: AccessorOptions['type'],
  interpolation: 'LINEAR' | 'STEP',
) {
  const input = builder.addAccessor(packFloat32(times), {
    componentType: COMPONENT_FLOAT,
    type: 'SCALAR',
    count: times.length,
    min: [Math.min(...times)],
    max: [Math.max(...times)],
  })
  const output = builder.addAccessor(packFloat32(values), {
    componentType: COMPONENT_FLOAT,
    type,
    count: times.length,
  })
  const samplers = animation.samplers as JsonObject[]
  samplers.push({ input, output, interpolation })
  return samplers.length - 1
}

function continuousQuaternions(values: readonly (readonly number[])[]) {
  const output: number[][] = []
  let previous: readonly number[] | undefined
  for (const rotation of values) {
    let current = [...rotation]
    if (previous && previous.reduce((sum, value, index) => sum + value * current[index], 0) < 0) {
      current = current.map((value) => -value)
    }
    output.push(current)
    previous = current
  }
  return output
}

function addTrsChannels(
  builder: BinaryBuilder,
  animation: JsonObject,
  node: number,
  frame: GxFrame,
  fps: number,
  start: number,
  end: number,
) {
  const keyframes = frame.keyframes
  if (!keyframes || keyframes.timelineIndices.length === 0) return
  const last = Math.min(end, keyframes.timelineIndices.length - 1)
  const first = Math.max(0, start)
  if (last < first) return
  const transforms = Array.from(
    keyframes.timelineIndices.slice(first, last + 1),
    (keyIndex) => decomposeGxMatrix(keyframes.matrices[keyIndex]),
  )
  const times = transforms.map((_, index) => index / fps)
  const rotations = continuousQuaternions(transforms.map((item) => item.rotation))
  const channels = animation.channels as JsonObject[]
  const specs = [
    ['translation', 'VEC3', transforms.flatMap((item) => item.translation)],
    ['rotation', 'VEC4', rotations.flat()],
    ['scale', 'VEC3', transforms.flatMap((item) => item.scale)],
  ] as const
  for (const [path, type, values] of specs) {
    channels.push({
      sampler: addAnimationSampler(builder, animation, times, values, type, 'LINEAR'),
      target: { node, path },
    })
  }
}

interface ClipRange {
  readonly name: string
  readonly start: number
  readonly end: number
  readonly animationId?: number
}

function clipRanges(sampleCount: number, xfi?: XfiParseResult | null): ClipRange[] {
  if (sampleCount <= 0) return []
  if (xfi?.animationRanges.length) {
    const ranges = xfi.animationRanges
      .filter((range) => !(range.start === 0 && range.end === 0) && range.start < sampleCount)
      .map((range) => ({
        name: range.animationId === 0
          ? 'idle'
          : range.animationId === 1
            ? 'move'
            : range.animationId === 3
              ? 'attack'
              : `xfi_${range.animationId}`,
        start: range.start,
        end: Math.min(range.end, sampleCount - 1),
        animationId: range.animationId,
      }))
    if (ranges.length > 0) return ranges
  }
  if (sampleCount === 121) {
    return [
      { name: 'move', start: 0, end: 40 },
      { name: 'idle', start: 40, end: 80 },
      { name: 'attack', start: 80, end: 120 },
    ]
  }
  return [{ name: 'full', start: 0, end: sampleCount - 1 }]
}

function buildFrameAnimations(
  builder: BinaryBuilder,
  frames: readonly GxFrame[],
  frameNodes: ReadonlyMap<number, number>,
  sourceName: string,
  fps: number,
  xfi?: XfiParseResult | null,
) {
  const sampleCount = Math.max(
    0,
    ...frames.map((frame) => frame.keyframes?.timelineIndices.length ?? 0),
  )
  const animations: JsonObject[] = []
  for (const range of clipRanges(sampleCount, xfi)) {
    const animation: JsonObject = {
      name: `${sourceStem(sourceName)}_${range.name}`,
      samplers: [],
      channels: [],
      extras: {
        gxAnimationClip: range.name,
        gxAnimationFps: fps,
        gxTimelineSampleRange: [range.start, range.end],
        ...(range.animationId === undefined ? {} : { gxXfiAnimationId: range.animationId }),
      },
    }
    for (const frame of frames) {
      const node = frameNodes.get(frame.index)
      if (node !== undefined) addTrsChannels(builder, animation, node, frame, fps, range.start, range.end)
    }
    if ((animation.channels as JsonObject[]).length > 0) animations.push(animation)
  }
  return animations
}

function buildSpriteAnimation(
  builder: BinaryBuilder,
  bindings: readonly SpriteBinding[],
  sourceName: string,
  fps: number,
) {
  if (bindings.length === 0) return null
  const animation: JsonObject = {
    name: `${sourceStem(sourceName)}_sprite`,
    samplers: [],
    channels: [],
    extras: { gxSpriteAnimation: true, gxAnimationFps: fps },
  }
  const channels = animation.channels as JsonObject[]
  for (const binding of bindings) {
    const metadata = binding.mesh.geometry.metadata
    if (metadata.variant !== 'sprite') continue
    const times = Array.from(metadata.animation.timelineIndices, (_, index) => index / fps)
    for (let frameIndex = 0; frameIndex < binding.nodes.length; frameIndex += 1) {
      const values = Array.from(metadata.animation.timelineIndices).flatMap((selected) =>
        selected === frameIndex ? [1, 1, 1] : [0, 0, 0],
      )
      channels.push({
        sampler: addAnimationSampler(builder, animation, times, values, 'VEC3', 'STEP'),
        target: { node: binding.nodes[frameIndex], path: 'scale' },
      })
    }
  }
  return channels.length > 0 ? animation : null
}

function writeGlb(gltf: JsonObject, binary: Uint8Array) {
  const encoder = new TextEncoder()
  const rawJson = encoder.encode(JSON.stringify(gltf))
  const jsonLength = rawJson.length + (4 - rawJson.length % 4) % 4
  const binLength = binary.length + (4 - binary.length % 4) % 4
  const totalLength = 12 + 8 + jsonLength + 8 + binLength
  const output = new Uint8Array(totalLength)
  const view = new DataView(output.buffer)
  view.setUint32(0, 0x46546c67, true)
  view.setUint32(4, 2, true)
  view.setUint32(8, totalLength, true)
  view.setUint32(12, jsonLength, true)
  view.setUint32(16, 0x4e4f534a, true)
  output.fill(0x20, 20, 20 + jsonLength)
  output.set(rawJson, 20)
  const binHeader = 20 + jsonLength
  view.setUint32(binHeader, binLength, true)
  view.setUint32(binHeader + 4, 0x004e4942, true)
  output.set(binary, binHeader + 8)
  return output.buffer
}

export async function convertGxToGlb(
  parsed: GxParseResult,
  options: GlbConversionOptions,
): Promise<GlbConversionResult> {
  const fps = options.animationFps ?? DEFAULT_ANIMATION_FPS
  if (!Number.isFinite(fps) || fps <= 0 || fps > 240) {
    throw new Error(`지원하지 않는 애니메이션 FPS입니다: ${fps}`)
  }
  const builder = new BinaryBuilder()
  const diagnostics: GlbConversionDiagnostic[] = []
  const textureBuild = await buildTextures(
    builder,
    parsed.meshes,
    options.textures ?? [],
    diagnostics,
    options.decodeTexture ?? defaultDecodeTexture,
  )
  const nodes: JsonObject[] = parsed.frames.map(frameNode)
  const frameNodes = new Map(parsed.frames.map((frame) => [frame.index, frame.index]))
  const sceneNodes: number[] = []
  for (const frame of parsed.frames) {
    if (frame.parentIndex === null) sceneNodes.push(frame.index)
    else appendChild(nodes, frame.parentIndex, frame.index)
  }
  const gltfMeshes: JsonObject[] = []
  const materials: JsonObject[] = []
  const materialIndices = new Map<string, number>()
  const spriteBindings: SpriteBinding[] = []

  for (const mesh of parsed.meshes) {
    const referenceKey = mesh.texture ? normalizedName(mesh.texture) : ''
    const blackBlend = textureBuild.blackBlendMeshes.has(mesh.index)
    const textureKey = blackBlend ? `${referenceKey}#blackblend` : referenceKey
    const textureIndex = mesh.texture ? textureBuild.indices.get(textureKey) : undefined
    const parent = mesh.frameIndex === null ? undefined : frameNodes.get(mesh.frameIndex)
    const metadata = mesh.geometry.metadata
    const meshNodeIndices: number[] = []
    const uvFrames = metadata.variant === 'sprite'
      ? metadata.animation.uvFrames
      : [mesh.geometry.uvs]
    for (let spriteIndex = 0; spriteIndex < uvFrames.length; spriteIndex += 1) {
      const gltfMesh = addMesh(
        builder,
        gltfMeshes,
        materials,
        materialIndices,
        mesh,
        uvFrames[spriteIndex],
        textureIndex,
        blackBlend,
      )
      const nodeIndex = nodes.length
      const selectedSprite = metadata.variant === 'sprite'
        ? metadata.animation.timelineIndices[0]
        : 0
      const node: JsonObject = {
        name: metadata.variant === 'sprite'
          ? `${mesh.name}_sprite_${String(spriteIndex).padStart(2, '0')}`
          : mesh.name,
        mesh: gltfMesh,
        extras: {
          ...(mesh.frameName ? { gxFrameName: mesh.frameName } : {}),
          ...(metadata.variant === 'sprite' ? { gxSpriteFrameIndex: spriteIndex } : {}),
        },
      }
      if (metadata.variant === 'sprite') {
        node.scale = spriteIndex === selectedSprite ? [1, 1, 1] : [0, 0, 0]
      }
      nodes.push(node)
      meshNodeIndices.push(nodeIndex)
      if (parent === undefined) sceneNodes.push(nodeIndex)
      else appendChild(nodes, parent, nodeIndex)
    }
    if (metadata.variant === 'sprite') {
      spriteBindings.push({ mesh, nodes: meshNodeIndices })
    }
  }

  const animations = buildFrameAnimations(
    builder,
    parsed.frames,
    frameNodes,
    options.sourceName,
    fps,
    options.xfi,
  )
  const spriteAnimation = buildSpriteAnimation(
    builder,
    spriteBindings,
    options.sourceName,
    fps,
  )
  if (spriteAnimation) animations.push(spriteAnimation)
  const binary = builder.finish()
  const gltf: JsonObject = {
    asset: { version: '2.0', generator: 'Nova Parts Calculator Web' },
    scene: 0,
    scenes: [{ name: sourceStem(options.sourceName), nodes: sceneNodes }],
    nodes,
    meshes: gltfMeshes,
    materials,
    buffers: [{ byteLength: binary.byteLength }],
    bufferViews: builder.bufferViews,
    accessors: builder.accessors,
    extras: {
      gxParserVersion: parsed.parserVersion,
      gxSourceName: options.sourceName,
    },
  }
  if (textureBuild.images.length > 0) gltf.images = textureBuild.images
  if (textureBuild.textures.length > 0) gltf.textures = textureBuild.textures
  if (textureBuild.samplers.length > 0) gltf.samplers = textureBuild.samplers
  if (animations.length > 0) gltf.animations = animations
  const textureReferences = [...new Set(
    parsed.meshes.flatMap((mesh) => mesh.texture ? [mesh.texture] : []),
  )].sort()
  const missingTextures = [...new Set(
    diagnostics.filter((item) => item.code === 'MISSING_TEXTURE').map((item) => item.texture),
  )].sort()
  return {
    glb: writeGlb(gltf, binary),
    metadata: {
      formatVersion: 1,
      parserVersion: parsed.parserVersion,
      sourceName: options.sourceName,
      meshCount: parsed.meshes.length,
      frameCount: parsed.frames.length,
      animationNames: animations.map((animation) => String(animation.name)),
      textureReferences,
      missingTextures,
      diagnostics,
    },
  }
}
