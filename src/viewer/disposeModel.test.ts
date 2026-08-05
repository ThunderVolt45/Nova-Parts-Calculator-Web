import { BufferGeometry, Group, Mesh, MeshStandardMaterial, Texture } from 'three'
import { describe, expect, it, vi } from 'vitest'

import { disposeModelObject } from './disposeModel.ts'

describe('Three.js 모델 리소스 수명주기', () => {
  it('여러 메시가 공유하는 GPU 리소스를 각각 한 번만 해제한다', () => {
    const root = new Group()
    const geometry = new BufferGeometry()
    const texture = new Texture()
    const material = new MeshStandardMaterial({ map: texture })
    const disposeGeometry = vi.spyOn(geometry, 'dispose')
    const disposeMaterial = vi.spyOn(material, 'dispose')
    const disposeTexture = vi.spyOn(texture, 'dispose')
    root.add(new Mesh(geometry, material), new Mesh(geometry, [material]))

    expect(disposeModelObject(root)).toEqual({
      geometries: 1,
      materials: 1,
      textures: 1,
    })
    expect(disposeGeometry).toHaveBeenCalledTimes(1)
    expect(disposeMaterial).toHaveBeenCalledTimes(1)
    expect(disposeTexture).toHaveBeenCalledTimes(1)
  })
})
