import { AnimationClip, Object3D, VectorKeyframeTrack } from 'three'
import { describe, expect, it } from 'vitest'

import { UnitAnimationController } from './unit-animation.ts'

function animatedPart(prefix: string) {
  const root = new Object3D()
  const clip = (name: string, distance: number) => new AnimationClip(
    `${prefix}_${name}`,
    1,
    [new VectorKeyframeTrack('.position', [0, 1], [0, 0, 0, distance, 0, 0])],
  )
  return {
    role: prefix as 'legs' | 'body' | 'weapon',
    root,
    clips: [clip('idle', 2), clip('move', 4), clip('attack', 6)],
  }
}

describe('조립 유닛 애니메이션 동기화', () => {
  it('세 부품의 같은 클립을 0초에서 시작해 같은 delta로 진행한다', () => {
    const parts = [animatedPart('legs'), animatedPart('body'), animatedPart('weapon')]
    const controller = new UnitAnimationController(parts)

    expect(controller.availableClips).toEqual(['idle', 'move', 'attack'])
    controller.selectClip('move')
    controller.update(0.25)

    expect(parts.map((part) => part.root.position.x)).toEqual([1, 1, 1])
    controller.restart()
    expect(parts.map((part) => part.root.position.x)).toEqual([0, 0, 0])
    controller.dispose()
  })

  it('일시정지는 현재 시점을 유지하고 재생하면 같은 시점부터 진행한다', () => {
    const parts = [animatedPart('legs'), animatedPart('body')]
    const controller = new UnitAnimationController(parts)
    controller.selectClip('idle')
    controller.update(0.25)
    controller.setPlaying(false)
    controller.update(0.5)
    expect(parts.map((part) => part.root.position.x)).toEqual([0.25, 0.25])

    controller.setPlaying(true)
    controller.update(0.25)
    expect(parts.map((part) => part.root.position.x)).toEqual([0.5, 0.5])
    controller.dispose()
  })

  it('idle은 원본 클립 속도의 절반으로 재생한다', () => {
    const parts = [animatedPart('legs'), animatedPart('body')]
    const controller = new UnitAnimationController(parts)

    controller.selectClip('idle')
    controller.update(0.5)

    expect(parts.map((part) => part.root.position.x)).toEqual([0.5, 0.5])
    controller.dispose()
  })

  it('짧은 attack은 완료 자세를 유지하고 0.5초 뒤에만 반복한다', () => {
    const parts = [animatedPart('legs'), animatedPart('body')]
    for (const part of parts) {
      const attack = part.clips.find((candidate) => candidate.name.endsWith('_attack'))
      if (attack) attack.duration = 0.2
    }
    const controller = new UnitAnimationController(parts)

    controller.selectClip('attack')
    controller.update(0.2)
    const completedPose = parts.map((part) => part.root.position.x)
    controller.update(0.29)
    expect(parts.map((part) => part.root.position.x)).toEqual(completedPose)
    controller.update(0.01)
    expect(parts.map((part) => part.root.position.x)).toEqual([0, 0])
    controller.dispose()
  })

  it('모든 로드 부품에 공통으로 존재하는 클립만 제공한다', () => {
    const complete = animatedPart('legs')
    const idleOnly = animatedPart('body')
    idleOnly.clips.splice(1)

    expect(new UnitAnimationController([complete, idleOnly]).availableClips)
      .toEqual(['idle'])
  })
})
