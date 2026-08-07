import { Group, Matrix4, type Object3D } from 'three'

import type {
  GltfMatrix,
  PartialUnitSocketAssembly,
} from '../gx/socket-assembly.ts'

function partRoot(
  name: string,
  object: Object3D,
  transform?: GltfMatrix,
) {
  const root = new Group()
  root.name = name
  root.add(object)
  if (transform) {
    root.matrix.copy(new Matrix4().fromArray(transform))
    root.matrixAutoUpdate = false
  }
  return root
}

export function createAssembledUnitObject(
  legs: Object3D,
  body: Object3D,
  weapon: Object3D,
  bodyTransform: GltfMatrix,
  weaponTransform: GltfMatrix,
) {
  return createPartialAssembledUnitObject(
    { legs, body, weapon },
    bodyTransform,
    weaponTransform,
  )
}

export function createPartialAssembledUnitObject(
  parts: {
    readonly legs?: Object3D
    readonly body?: Object3D
    readonly weapon?: Object3D
  },
  bodyTransform: GltfMatrix,
  weaponTransform: GltfMatrix,
) {
  const assembled = new Group()
  assembled.name = 'nova_unit_assembly'
  if (parts.legs) assembled.add(partRoot('legs', parts.legs))
  if (parts.body) assembled.add(partRoot('body', parts.body, bodyTransform))
  if (parts.weapon) assembled.add(partRoot('weapon', parts.weapon, weaponTransform))
  return assembled
}

function findPrimaryFrame(
  root: Object3D,
  frameIndex: number | null,
  frameName: string | null,
) {
  let indexed: Object3D | null = null
  if (frameIndex !== null) {
    root.traverse((object) => {
      if (!indexed && object.userData.gxFrameIndex === frameIndex) indexed = object
    })
  }
  return indexed ?? (frameName ? root.getObjectByName(frameName) : null)
}

export function createSocketDrivenUnitObject(
  parts: {
    readonly legs?: Object3D
    readonly body?: Object3D
    readonly weapon?: Object3D
  },
  sockets: PartialUnitSocketAssembly,
) {
  const assembled = new Group()
  assembled.name = 'nova_unit_assembly'

  const legsRoot = parts.legs ? partRoot('legs', parts.legs) : null
  const bodyRoot = parts.body ? partRoot('body', parts.body) : null
  const weaponRoot = parts.weapon ? partRoot('weapon', parts.weapon) : null
  if (legsRoot) assembled.add(legsRoot)

  const legsFrame = parts.legs
    ? findPrimaryFrame(
        parts.legs,
        sockets.legsPrimaryFrameIndex,
        sockets.legsPrimaryFrame,
      )
    : null
  if (bodyRoot) {
    if (legsFrame && sockets.bodySocket) {
      legsFrame.add(partRoot('body_socket', bodyRoot, sockets.bodySocket))
    } else {
      bodyRoot.matrix.copy(new Matrix4().fromArray(sockets.bodyTransform))
      bodyRoot.matrixAutoUpdate = false
      assembled.add(bodyRoot)
    }
  }

  const bodyFrame = parts.body
    ? findPrimaryFrame(
        parts.body,
        sockets.bodyPrimaryFrameIndex,
        sockets.bodyPrimaryFrame,
      )
    : null
  if (weaponRoot) {
    if (bodyFrame && sockets.weaponSocket) {
      bodyFrame.add(partRoot('weapon_socket', weaponRoot, sockets.weaponSocket))
    } else if (!bodyRoot && legsFrame && sockets.bodySocket) {
      legsFrame.add(partRoot('weapon_leg_socket', weaponRoot, sockets.bodySocket))
    } else {
      weaponRoot.matrix.copy(new Matrix4().fromArray(sockets.weaponTransform))
      weaponRoot.matrixAutoUpdate = false
      assembled.add(weaponRoot)
    }
  }

  return assembled
}
