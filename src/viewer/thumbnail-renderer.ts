import {
  AmbientLight,
  Box3,
  Color,
  DirectionalLight,
  HemisphereLight,
  MathUtils,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  type Object3D,
} from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

import type { GltfMatrix } from '../gx/socket-assembly.ts'
import { createAssembledUnitObject } from './assembled-object.ts'
import { disposeModelObject } from './disposeModel.ts'

export interface UnitThumbnailInput {
  readonly legsGlb: ArrayBuffer
  readonly bodyGlb: ArrayBuffer
  readonly weaponGlb: ArrayBuffer
  readonly bodyTransform: GltfMatrix
  readonly weaponTransform: GltfMatrix
}

let renderQueue = Promise.resolve()

function scheduleThumbnail<T>(task: () => Promise<T>) {
  const result = renderQueue.then(task, task)
  renderQueue = result.then(() => undefined, () => undefined)
  return result
}

function fitCamera(camera: PerspectiveCamera, object: Object3D) {
  object.updateMatrixWorld(true)
  const bounds = new Box3().setFromObject(object)
  if (bounds.isEmpty()) throw new Error('표시할 3D 지오메트리가 없습니다.')
  const center = bounds.getCenter(new Vector3())
  const size = bounds.getSize(new Vector3())
  const maximum = Math.max(size.x, size.y, size.z, 0.01)
  const distance = maximum / (2 * Math.tan(MathUtils.degToRad(camera.fov / 2))) * 0.72
  camera.position.set(
    center.x + distance * 0.72,
    center.y + distance * 0.38,
    center.z + distance,
  )
  camera.near = Math.max(distance / 100, 0.001)
  camera.far = Math.max(distance * 100, 100)
  camera.lookAt(center)
  camera.updateProjectionMatrix()
}

async function renderObjectThumbnail(object: Object3D) {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 384
  const renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true })
  renderer.outputColorSpace = SRGBColorSpace
  renderer.setPixelRatio(1)
  renderer.setSize(canvas.width, canvas.height, false)
  renderer.setClearColor(new Color(0x000000), 0)
  const scene = new Scene()
  const camera = new PerspectiveCamera(38, canvas.width / canvas.height, 0.01, 1000)
  scene.add(
    new AmbientLight(0xffffff, 1.8),
    new HemisphereLight(0xb8f7ff, 0x071015, 1.7),
  )
  const key = new DirectionalLight(0xffffff, 2.5)
  key.position.set(4, 7, 5)
  scene.add(key)
  const rim = new DirectionalLight(0x45c8dd, 1)
  rim.position.set(-4, 2, -3)
  scene.add(rim)
  scene.add(object)

  try {
    fitCamera(camera, object)
    renderer.render(scene, camera)
    return canvas.toDataURL('image/png')
  } finally {
    scene.remove(object)
    disposeModelObject(object)
    renderer.dispose()
    renderer.forceContextLoss()
  }
}

export function renderPartThumbnail(glb: ArrayBuffer) {
  return scheduleThumbnail(async () => {
    const result = await new GLTFLoader().parseAsync(glb, '')
    return renderObjectThumbnail(result.scene)
  })
}

export function renderUnitThumbnail(input: UnitThumbnailInput) {
  return scheduleThumbnail(async () => {
    const loader = new GLTFLoader()
    const scenes: Object3D[] = []
    try {
      for (const glb of [input.legsGlb, input.bodyGlb, input.weaponGlb]) {
        scenes.push((await loader.parseAsync(glb, '')).scene)
      }
      const assembled = createAssembledUnitObject(
        scenes[0],
        scenes[1],
        scenes[2],
        input.bodyTransform,
        input.weaponTransform,
      )
      scenes.length = 0
      return await renderObjectThumbnail(assembled)
    } finally {
      for (const scene of scenes) disposeModelObject(scene)
    }
  })
}
