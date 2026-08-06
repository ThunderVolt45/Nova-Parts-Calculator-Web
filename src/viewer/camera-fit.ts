import {
  Box3,
  MathUtils,
  PerspectiveCamera,
  Vector3,
  type Object3D,
} from 'three'

export interface CameraTargetControls {
  readonly target: Vector3
  maxDistance: number
  update(): void
}

export function fitPerspectiveCameraToObject(
  camera: PerspectiveCamera,
  object: Object3D,
  controls: CameraTargetControls,
  viewport: { readonly width: number; readonly height: number },
  margin = 1.25,
  viewDirection?: Vector3,
) {
  object.updateWorldMatrix(true, true)
  const bounds = new Box3().setFromObject(object)
  return fitPerspectiveCameraToBounds(
    camera,
    bounds,
    controls,
    viewport,
    margin,
    viewDirection,
  )
}

export function fitPerspectiveCameraToBounds(
  camera: PerspectiveCamera,
  bounds: Box3,
  controls: CameraTargetControls,
  viewport: { readonly width: number; readonly height: number },
  margin = 1.25,
  viewDirection?: Vector3,
) {
  if (bounds.isEmpty()) return false

  const center = bounds.getCenter(new Vector3())
  const size = bounds.getSize(new Vector3())
  const maximum = Math.max(size.x, size.y, size.z, 0.01)
  const aspect = Math.max(viewport.width / Math.max(viewport.height, 1), 0.01)
  const verticalFov = MathUtils.degToRad(camera.fov)
  const heightDistance = maximum / (2 * Math.tan(verticalFov / 2))
  const distance = margin * Math.max(heightDistance, heightDistance / aspect)
  const direction = viewDirection?.clone()
    ?? camera.position.clone().sub(controls.target)
  if (direction.lengthSq() < 1e-8) direction.set(0.52, 0.37, 0.78)
  direction.normalize()

  camera.aspect = aspect
  camera.position.copy(center).addScaledVector(direction, distance)
  camera.near = Math.max(distance / 100, 0.001)
  camera.far = Math.max(distance * 100, 100)
  camera.lookAt(center)
  camera.updateMatrixWorld(true)
  camera.updateProjectionMatrix()

  controls.target.copy(center)
  controls.maxDistance = distance * 10
  controls.update()
  return true
}
