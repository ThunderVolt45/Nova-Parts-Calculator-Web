import { BoxGeometry, Group, Mesh, MeshBasicMaterial, PerspectiveCamera, Vector3 } from 'three'
import { describe, expect, it, vi } from 'vitest'

import { fitPerspectiveCameraToObject } from './camera-fit.ts'

describe('3D 카메라 즉시 맞춤', () => {
  it('모델 교체마다 현재 바운딩과 화면 비율로 카메라와 타깃을 즉시 갱신한다', () => {
    const camera = new PerspectiveCamera(42, 1, 0.01, 1000)
    camera.position.set(2.8, 2, 4.2)
    const controls = {
      target: new Vector3(),
      maxDistance: 1000,
      update: vi.fn(),
    }
    const small = new Group()
    small.add(new Mesh(new BoxGeometry(2, 2, 2), new MeshBasicMaterial()))
    const large = new Group()
    large.add(new Mesh(new BoxGeometry(8, 8, 8), new MeshBasicMaterial()))

    expect(fitPerspectiveCameraToObject(
      camera,
      small,
      controls,
      { width: 900, height: 700 },
    )).toBe(true)
    const smallDistance = camera.position.distanceTo(controls.target)

    expect(fitPerspectiveCameraToObject(
      camera,
      large,
      controls,
      { width: 900, height: 700 },
    )).toBe(true)
    const largeDistance = camera.position.distanceTo(controls.target)

    expect(controls.target.toArray()).toEqual([0, 0, 0])
    expect(largeDistance).toBeCloseTo(smallDistance * 4)
    expect(camera.aspect).toBeCloseTo(900 / 700)
    expect(controls.update).toHaveBeenCalledTimes(2)
  })

  it('지오메트리가 없는 객체에는 기존 카메라 상태을 유지한다', () => {
    const camera = new PerspectiveCamera()
    camera.position.set(1, 2, 3)
    const controls = {
      target: new Vector3(),
      maxDistance: 100,
      update: vi.fn(),
    }

    expect(fitPerspectiveCameraToObject(
      camera,
      new Group(),
      controls,
      { width: 900, height: 700 },
    )).toBe(false)
    expect(camera.position.toArray()).toEqual([1, 2, 3])
    expect(controls.update).not.toHaveBeenCalled()
  })
})
