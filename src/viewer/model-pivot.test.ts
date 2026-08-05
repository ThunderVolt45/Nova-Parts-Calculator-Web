import { Box3, BoxGeometry, Group, Mesh, MeshBasicMaterial, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'

import { centerModelPivot } from './model-pivot.ts'

describe('3D 모델 회전 중심', () => {
  it('비대칭으로 배치된 전체 모델의 실제 바운딩 중심을 원점으로 옮긴다', () => {
    const root = new Group()
    const material = new MeshBasicMaterial()
    const left = new Mesh(new BoxGeometry(2, 2, 2), material)
    const right = new Mesh(new BoxGeometry(2, 2, 2), material)
    left.position.x = 10
    right.position.x = 14
    root.add(left, right)

    const originalCenter = centerModelPivot(root)
    const centered = new Box3().setFromObject(root).getCenter(new Vector3())

    expect(originalCenter?.toArray()).toEqual([12, 0, 0])
    expect(centered.x).toBeCloseTo(0)
    expect(centered.y).toBeCloseTo(0)
    expect(centered.z).toBeCloseTo(0)
  })

  it('지오메트리가 없는 객체는 위치를 변경하지 않는다', () => {
    const root = new Group()
    root.position.set(3, 4, 5)

    expect(centerModelPivot(root)).toBeNull()
    expect(root.position.toArray()).toEqual([3, 4, 5])
  })
})
