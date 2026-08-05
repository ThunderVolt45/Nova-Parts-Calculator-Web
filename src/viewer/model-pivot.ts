import { Box3, Vector3, type Object3D } from 'three'

export function centerModelPivot(object: Object3D) {
  object.updateMatrixWorld(true)
  const bounds = new Box3().setFromObject(object)
  if (bounds.isEmpty()) return null

  const center = bounds.getCenter(new Vector3())
  object.position.sub(center)
  object.updateMatrixWorld(true)
  return center
}
