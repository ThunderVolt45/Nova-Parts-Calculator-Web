import {
  Box3,
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Vector3,
} from 'three'
import { describe, expect, it, vi } from 'vitest'

import {
  fitPerspectiveCameraToBounds,
  fitPerspectiveCameraToObject,
} from './camera-fit.ts'

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

  it('지정한 기본 시점 방향으로 회전과 확대 상태를 함께 초기화한다', () => {
    const camera = new PerspectiveCamera(42, 1, 0.01, 1000)
    camera.position.set(-4, 1, 0)
    const controls = {
      target: new Vector3(),
      maxDistance: 1000,
      update: vi.fn(),
    }
    const object = new Group()
    object.add(new Mesh(new BoxGeometry(2, 2, 2), new MeshBasicMaterial()))
    const defaultDirection = new Vector3(2.8, 2, 4.2).normalize()

    fitPerspectiveCameraToObject(
      camera,
      object,
      controls,
      { width: 900, height: 700 },
      1.25,
      defaultDirection,
    )

    expect(
      camera.position
        .clone()
        .sub(controls.target)
        .normalize()
        .distanceTo(defaultDirection),
    ).toBeLessThan(1e-12)
  })

  it('T-pose 바운딩을 보관하면 애니메이션 자세가 바뀌어도 기준점을 유지한다', () => {
    const camera = new PerspectiveCamera(42, 1, 0.01, 1000)
    camera.position.set(2.8, 2, 4.2)
    const controls = {
      target: new Vector3(),
      maxDistance: 1000,
      update: vi.fn(),
    }
    const object = new Group()
    object.add(new Mesh(new BoxGeometry(2, 4, 2), new MeshBasicMaterial()))
    object.updateWorldMatrix(true, true)
    const tPoseBounds = new Box3().setFromObject(object)

    expect(fitPerspectiveCameraToBounds(
      camera,
      tPoseBounds,
      controls,
      { width: 900, height: 700 },
    )).toBe(true)
    const tPoseTarget = controls.target.clone()
    const tPoseDistance = camera.position.distanceTo(controls.target)

    object.position.set(20, 30, -10)
    object.scale.setScalar(4)
    object.updateWorldMatrix(true, true)
    expect(fitPerspectiveCameraToBounds(
      camera,
      tPoseBounds,
      controls,
      { width: 900, height: 700 },
    )).toBe(true)

    expect(controls.target.toArray()).toEqual(tPoseTarget.toArray())
    expect(camera.position.distanceTo(controls.target)).toBeCloseTo(tPoseDistance)
  })
})
