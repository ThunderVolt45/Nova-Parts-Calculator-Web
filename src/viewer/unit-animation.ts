import {
  AnimationClip,
  AnimationMixer,
  LoopOnce,
  LoopRepeat,
  type AnimationAction,
  type Object3D,
} from 'three'

export const UNIT_ANIMATION_CLIPS = ['idle', 'move', 'attack'] as const
export type UnitAnimationClip = typeof UNIT_ANIMATION_CLIPS[number]

const IDLE_TIME_SCALE = 0.5
const ATTACK_MINIMUM_INTERVAL_SECONDS = 0.5

export interface UnitAnimationPlayback {
  readonly clip: UnitAnimationClip
  readonly playing: boolean
  readonly restartToken: number
}

export interface AnimatedUnitPart {
  readonly role: 'legs' | 'body' | 'weapon'
  readonly root: Object3D
  readonly clips: readonly AnimationClip[]
}

function findClip(
  clips: readonly AnimationClip[],
  requested: UnitAnimationClip,
) {
  return clips.find((clip) => {
    const name = clip.name.toLowerCase()
    return name === requested || name.endsWith(`_${requested}`)
  })
}

export class UnitAnimationController {
  readonly availableClips: readonly UnitAnimationClip[]
  private readonly entries: readonly {
    readonly root: Object3D
    readonly mixer: AnimationMixer
    readonly clips: readonly AnimationClip[]
  }[]
  private actions: AnimationAction[] = []
  private playing = false
  private selectedClip: UnitAnimationClip | null = null
  private attackElapsed = 0
  private attackInterval = ATTACK_MINIMUM_INTERVAL_SECONDS

  constructor(parts: readonly AnimatedUnitPart[]) {
    const roleOrder = { legs: 0, body: 1, weapon: 2 } as const
    this.entries = [...parts].sort(
      (left, right) => roleOrder[left.role] - roleOrder[right.role],
    ).map((part) => ({
      ...part,
      mixer: new AnimationMixer(part.root),
    }))
    this.availableClips = UNIT_ANIMATION_CLIPS.filter((requested) =>
      this.entries.length > 0
      && this.entries.every((entry) => Boolean(findClip(entry.clips, requested))),
    )
  }

  selectClip(clip: UnitAnimationClip, playing = true) {
    for (const entry of this.entries) entry.mixer.stopAllAction()
    const selectedClips: AnimationClip[] = []
    this.actions = this.entries.flatMap((entry) => {
      const selected = findClip(entry.clips, clip)
      if (!selected) return []
      selectedClips.push(selected)
      const action = entry.mixer.clipAction(selected)
      if (clip === 'attack') {
        action.setLoop(LoopOnce, 1)
        action.clampWhenFinished = true
      } else {
        action.setLoop(LoopRepeat, Infinity)
      }
      return [action]
    })
    this.selectedClip = clip
    this.attackInterval = Math.max(
      ATTACK_MINIMUM_INTERVAL_SECONDS,
      ...selectedClips.map((selected) => selected.duration),
    )
    this.playing = playing
    this.restart()
  }

  setPlaying(playing: boolean) {
    this.playing = playing
    for (const entry of this.entries) entry.mixer.timeScale = playing ? 1 : 0
  }

  restart() {
    this.attackElapsed = 0
    this.restartActions()
    this.setPlaying(this.playing)
  }

  private restartActions() {
    for (const action of this.actions) action.reset().play()
    for (const entry of this.entries) entry.mixer.setTime(0)
  }

  update(delta: number) {
    if (!this.isAnimating) return
    if (this.selectedClip === 'attack') {
      this.updateAttack(delta)
      return
    }
    const scaledDelta = this.selectedClip === 'idle' ? delta * IDLE_TIME_SCALE : delta
    for (const entry of this.entries) entry.mixer.update(scaledDelta)
  }

  private updateAttack(delta: number) {
    let remaining = Math.max(0, delta)
    while (remaining > 0) {
      const untilRestart = this.attackInterval - this.attackElapsed
      const step = Math.min(remaining, untilRestart)
      for (const entry of this.entries) entry.mixer.update(step)
      this.attackElapsed += step
      remaining -= step
      if (this.attackElapsed + Number.EPSILON >= this.attackInterval) {
        this.attackElapsed = 0
        this.restartActions()
      }
    }
  }

  get isAnimating() {
    return this.playing && this.actions.length > 0
  }

  dispose() {
    for (const entry of this.entries) {
      entry.mixer.stopAllAction()
      entry.mixer.uncacheRoot(entry.root)
    }
    this.actions = []
    this.selectedClip = null
  }
}
