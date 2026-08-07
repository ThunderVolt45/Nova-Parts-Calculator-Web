import { BufferGeometry, Group, Mesh, MeshBasicMaterial, Texture, Vector3 } from 'three'
import { describe, expect, it, vi } from 'vitest'

import type { GltfMatrix, PartialUnitSocketAssembly } from '../gx/socket-assembly.ts'
import {
  createAssembledUnitObject,
  createPartialAssembledUnitObject,
  createSocketDrivenUnitObject,
} from './assembled-object.ts'
import { disposeModelObject } from './disposeModel.ts'

const identity: GltfMatrix = [
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
]

function translation(x: number): GltfMatrix {
  const matrix = [...identity]
  matrix[12] = x
  return matrix as unknown as GltfMatrix
}

describe('Three.js 조립 유닛 객체', () => {
  it('세 부품 그룹에 소켓 변환을 적용하고 전체 GPU 자원을 해제한다', () => {
    const texture = new Texture()
    const textureDispose = vi.spyOn(texture, 'dispose')
    const meshes = ['legs', 'body', 'weapon'].map(() => {
      const geometry = new BufferGeometry()
      const material = new MeshBasicMaterial({ map: texture })
      return {
        mesh: new Mesh(geometry, material),
        geometryDispose: vi.spyOn(geometry, 'dispose'),
        materialDispose: vi.spyOn(material, 'dispose'),
      }
    })
    const bodyTransform = [...identity]
    const weaponTransform = [...identity]
    bodyTransform[12] = 12
    weaponTransform[13] = 34

    const assembled = createAssembledUnitObject(
      meshes[0].mesh,
      meshes[1].mesh,
      meshes[2].mesh,
      bodyTransform as unknown as GltfMatrix,
      weaponTransform as unknown as GltfMatrix,
    )

    expect(assembled.children.map((child) => child.name))
      .toEqual(['legs', 'body', 'weapon'])
    expect(assembled.children[1].matrix.elements[12]).toBe(12)
    expect(assembled.children[2].matrix.elements[13]).toBe(34)
    expect(disposeModelObject(assembled)).toEqual({
      geometries: 3,
      materials: 3,
      textures: 1,
    })
    for (const item of meshes) {
      expect(item.geometryDispose).toHaveBeenCalledTimes(1)
      expect(item.materialDispose).toHaveBeenCalledTimes(1)
    }
    expect(textureDispose).toHaveBeenCalledTimes(1)
  })

  it('일부 부품만 있어도 존재하는 모델로 조립 객체를 만든다', () => {
    const legs = new Mesh(new BufferGeometry(), new MeshBasicMaterial())
    const weapon = new Mesh(new BufferGeometry(), new MeshBasicMaterial())

    const assembled = createPartialAssembledUnitObject(
      { legs, weapon },
      identity,
      identity,
    )

    expect(assembled.children.map((child) => child.name)).toEqual(['legs', 'weapon'])
    expect(disposeModelObject(assembled)).toEqual({
      geometries: 2,
      materials: 2,
      textures: 0,
    })
  })

  it('다리와 몸통 애니메이션 프레임 아래에 다음 부품 소켓을 계층 조립한다', () => {
    const legs = new Group()
    const legsFrame = new Group()
    legsFrame.name = 'legs_primary'
    legsFrame.userData.gxFrameIndex = 1
    legsFrame.position.x = 1
    legs.add(legsFrame)

    const body = new Group()
    const bodyFrame = new Group()
    bodyFrame.name = 'body_primary'
    bodyFrame.userData.gxFrameIndex = 2
    bodyFrame.position.x = 3
    body.add(bodyFrame)
    const weapon = new Group()
    const sockets: PartialUnitSocketAssembly = {
      bodyTransform: translation(3),
      weaponTransform: translation(10),
      bodySocket: translation(2),
      weaponSocket: translation(4),
      legsPrimaryFrame: 'legs_primary',
      legsPrimaryFrameIndex: 1,
      bodyPrimaryFrame: 'body_primary',
      bodyPrimaryFrameIndex: 2,
      bodyAttached: true,
      weaponAttached: true,
      diagnostics: [],
    }

    const assembled = createSocketDrivenUnitObject(
      { legs, body, weapon },
      sockets,
    )
    const bodyRoot = assembled.getObjectByName('body')!
    const weaponRoot = assembled.getObjectByName('weapon')!
    assembled.updateMatrixWorld(true)
    expect(bodyRoot.getWorldPosition(new Vector3()).x).toBe(3)
    expect(weaponRoot.getWorldPosition(new Vector3()).x).toBe(10)

    legsFrame.position.x = 5
    assembled.updateMatrixWorld(true)
    expect(bodyRoot.getWorldPosition(new Vector3()).x).toBe(7)
    expect(weaponRoot.getWorldPosition(new Vector3()).x).toBe(14)

    bodyFrame.position.x = 6
    assembled.updateMatrixWorld(true)
    expect(bodyRoot.getWorldPosition(new Vector3()).x).toBe(7)
    expect(weaponRoot.getWorldPosition(new Vector3()).x).toBe(17)
  })

  it('몸통이 없으면 무기를 다리의 몸통 소켓 아래에 계층 조립한다', () => {
    const legs = new Group()
    const legsFrame = new Group()
    legsFrame.name = 'legs_primary'
    legsFrame.userData.gxFrameIndex = 1
    legsFrame.position.x = 3
    legs.add(legsFrame)
    const weapon = new Group()
    const sockets: PartialUnitSocketAssembly = {
      bodyTransform: translation(5),
      weaponTransform: translation(5),
      bodySocket: translation(2),
      weaponSocket: null,
      legsPrimaryFrame: 'legs_primary',
      legsPrimaryFrameIndex: 1,
      bodyPrimaryFrame: null,
      bodyPrimaryFrameIndex: null,
      bodyAttached: true,
      weaponAttached: true,
      diagnostics: [],
    }

    const assembled = createSocketDrivenUnitObject({ legs, weapon }, sockets)
    const weaponRoot = assembled.getObjectByName('weapon')!
    assembled.updateMatrixWorld(true)
    expect(weaponRoot.getWorldPosition(new Vector3()).x).toBe(5)

    legsFrame.position.x = 7
    assembled.updateMatrixWorld(true)
    expect(weaponRoot.getWorldPosition(new Vector3()).x).toBe(9)
  })
})
