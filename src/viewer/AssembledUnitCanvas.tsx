import { OrbitControls } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Box3, Group, PerspectiveCamera, Vector3 } from 'three'
import type { OrbitControls as OrbitControlsImplementation } from 'three-stdlib'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

import type {
  GltfMatrix,
  PartialUnitSocketAssembly,
} from '../gx/socket-assembly.ts'
import {
  createPartialAssembledUnitObject,
  createSocketDrivenUnitObject,
} from './assembled-object.ts'
import { fitPerspectiveCameraToBounds } from './camera-fit.ts'
import {
  calculateViewerCameraState,
  type ViewerCameraState,
} from './camera-state.ts'
import { disposeModelObject } from './disposeModel.ts'
import { centerModelPivot } from './model-pivot.ts'
import {
  UnitAnimationController,
  type AnimatedUnitPart,
  type UnitAnimationClip,
  type UnitAnimationPlayback,
} from './unit-animation.ts'

export interface AssembledUnitCanvasProps {
  readonly legsGlb?: ArrayBuffer
  readonly bodyGlb?: ArrayBuffer
  readonly weaponGlb?: ArrayBuffer
  readonly bodyTransform: GltfMatrix
  readonly weaponTransform: GltfMatrix
  readonly socketChain?: PartialUnitSocketAssembly
  readonly resetToken: number
  readonly animation?: UnitAnimationPlayback
  readonly label: string
  onReady(): void
  onError(error: Error): void
  onAnimationClipsChange?(clips: readonly UnitAnimationClip[]): void
  onCameraStateChange?(state: ViewerCameraState): void
  onInteractionStart?(): void
}

interface AssemblyCanvasScene {
  readonly object: Group
  readonly animatedParts: readonly AnimatedUnitPart[]
  readonly tPoseBounds: Box3
}

const defaultAnimation: UnitAnimationPlayback = {
  clip: 'idle',
  playing: true,
  restartToken: 0,
}

const DEFAULT_ASSEMBLY_VIEW_DIRECTION = new Vector3(2.8, 2, 4.2)

function AnimatedAssembly({
  scene,
  resetToken,
  controls,
  animation,
  onAnimationClipsChange,
  onCameraStateChange,
  publishCameraStateRef,
}: {
  readonly scene: AssemblyCanvasScene
  readonly resetToken: number
  readonly controls: React.RefObject<OrbitControlsImplementation | null>
  readonly animation: UnitAnimationPlayback
  onAnimationClipsChange?(clips: readonly UnitAnimationClip[]): void
  onCameraStateChange?(state: ViewerCameraState): void
  readonly publishCameraStateRef: { current: () => void }
}) {
  const camera = useThree((state) => state.camera)
  const size = useThree((state) => state.size)
  const invalidate = useThree((state) => state.invalidate)
  const controller = useMemo(
    () => new UnitAnimationController(scene.animatedParts),
    [scene.animatedParts],
  )
  const restartTokenRef = useRef(animation.restartToken)
  const playingRef = useRef(animation.playing)
  const onClipsChangeRef = useRef(onAnimationClipsChange)
  const onCameraStateChangeRef = useRef(onCameraStateChange)
  const previousResetTokenRef = useRef(resetToken)
  const fittedDistanceRef = useRef(0)
  playingRef.current = animation.playing
  onClipsChangeRef.current = onAnimationClipsChange
  onCameraStateChangeRef.current = onCameraStateChange

  const publishCameraState = () => {
    const orbitControls = controls.current
    if (!orbitControls) return
    const distance = camera.position.distanceTo(orbitControls.target)
    const fittedDistance = fittedDistanceRef.current || distance
    onCameraStateChangeRef.current?.(calculateViewerCameraState(
      orbitControls.getAzimuthalAngle(),
      orbitControls.getPolarAngle(),
      fittedDistance,
      distance,
    ))
  }
  publishCameraStateRef.current = publishCameraState

  useEffect(() => {
    onClipsChangeRef.current?.(controller.availableClips)
    return () => {
      onClipsChangeRef.current?.([])
      controller.dispose()
    }
  }, [controller])

  useLayoutEffect(() => {
    controller.selectClip(animation.clip, playingRef.current)
  }, [animation.clip, controller])

  useLayoutEffect(() => {
    controller.setPlaying(animation.playing)
    if (animation.playing) invalidate()
  }, [animation.playing, controller, invalidate])

  useLayoutEffect(() => {
    if (restartTokenRef.current === animation.restartToken) return
    restartTokenRef.current = animation.restartToken
    controller.restart()
    invalidate()
  }, [animation.restartToken, controller, invalidate])

  useLayoutEffect(() => {
    if (!(camera instanceof PerspectiveCamera) || !controls.current) return
    const resetRotation = previousResetTokenRef.current !== resetToken
    previousResetTokenRef.current = resetToken
    const fitted = fitPerspectiveCameraToBounds(
      camera,
      scene.tPoseBounds,
      controls.current,
      size,
      1.25,
      resetRotation ? DEFAULT_ASSEMBLY_VIEW_DIRECTION : undefined,
    )
    if (fitted) {
      fittedDistanceRef.current = camera.position.distanceTo(controls.current.target)
      publishCameraStateRef.current()
    }
    invalidate()
  }, [
    camera,
    controls,
    invalidate,
    publishCameraStateRef,
    resetToken,
    scene.tPoseBounds,
    size,
  ])

  useFrame((_, delta) => {
    if (!controller.isAnimating) return
    controller.update(delta)
    scene.object.updateMatrixWorld(true)
    invalidate()
  })

  return <primitive object={scene.object} />
}

export function AssembledUnitCanvas({
  legsGlb,
  bodyGlb,
  weaponGlb,
  bodyTransform,
  weaponTransform,
  socketChain,
  resetToken,
  animation = defaultAnimation,
  label,
  onReady,
  onError,
  onAnimationClipsChange,
  onCameraStateChange,
  onInteractionStart,
}: AssembledUnitCanvasProps) {
  const [scene, setScene] = useState<AssemblyCanvasScene | null>(null)
  const controls = useRef<OrbitControlsImplementation>(null)
  const publishCameraStateRef = useRef<() => void>(() => undefined)
  const onReadyRef = useRef(onReady)
  const onErrorRef = useRef(onError)
  onReadyRef.current = onReady
  onErrorRef.current = onError

  useEffect(() => {
    let cancelled = false
    let assembled: Group | null = null
    setScene(null)
    const loader = new GLTFLoader()
    const sources = [
      legsGlb ? { kind: 'legs' as const, glb: legsGlb } : null,
      bodyGlb ? { kind: 'body' as const, glb: bodyGlb } : null,
      weaponGlb ? { kind: 'weapon' as const, glb: weaponGlb } : null,
    ].filter((source) => source !== null)
    Promise.allSettled(sources.map(async ({ kind, glb }) => {
      const result = await loader.parseAsync(glb, '')
      return { kind, scene: result.scene, animations: result.animations }
    })).then(
      (results) => {
        const loaded = results.flatMap((result) =>
          result.status === 'fulfilled' ? [result.value] : [],
        )
        const failure = results.find((result) => result.status === 'rejected')
        if (failure?.status === 'rejected') {
          for (const { scene } of loaded) disposeModelObject(scene)
          if (!cancelled) {
            onErrorRef.current(
              failure.reason instanceof Error
                ? failure.reason
                : new Error('조립 GLB 장면을 읽지 못했습니다.'),
            )
          }
          return
        }
        const parts = Object.fromEntries(
          loaded.map(({ kind, scene }) => [kind, scene]),
        )
        assembled = socketChain
          ? createSocketDrivenUnitObject(parts, socketChain)
          : createPartialAssembledUnitObject(
              parts,
              bodyTransform,
              weaponTransform,
            )
        centerModelPivot(assembled)
        assembled.updateWorldMatrix(true, true)
        const tPoseBounds = new Box3().setFromObject(assembled)
        if (cancelled) {
          disposeModelObject(assembled)
          return
        }
        setScene({
          object: assembled,
          tPoseBounds,
          animatedParts: loaded.map(({ kind, scene, animations }) => ({
            role: kind,
            root: scene,
            clips: animations,
          })),
        })
        onReadyRef.current()
      },
      (error: unknown) => {
        if (!cancelled) onErrorRef.current(
          error instanceof Error ? error : new Error('조립 GLB 장면을 읽지 못했습니다.'),
        )
      },
    )
    return () => {
      cancelled = true
      if (assembled) disposeModelObject(assembled)
    }
  }, [bodyGlb, bodyTransform, legsGlb, socketChain, weaponGlb, weaponTransform])

  return (
    <div className="model-canvas assembled-unit-canvas" aria-label={label}>
      <Canvas
        camera={{ position: [2.8, 2, 4.2], fov: 42, near: 0.01, far: 100_000 }}
        dpr={[1, 1.5]}
        frameloop="demand"
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      >
        <ambientLight intensity={1.6} />
        <hemisphereLight args={['#b8f7ff', '#071015', 1.8]} />
        <directionalLight position={[4, 7, 5]} intensity={2.4} />
        <directionalLight position={[-4, 2, -3]} intensity={0.8} color="#45c8dd" />
        <OrbitControls
          ref={controls}
          makeDefault
          enableDamping
          dampingFactor={0.08}
          minDistance={0.01}
          maxDistance={100_000}
          onChange={() => publishCameraStateRef.current()}
          onStart={onInteractionStart}
        />
        {scene && (
          <AnimatedAssembly
            scene={scene}
            resetToken={resetToken}
            controls={controls}
            animation={animation}
            onAnimationClipsChange={onAnimationClipsChange}
            onCameraStateChange={onCameraStateChange}
            publishCameraStateRef={publishCameraStateRef}
          />
        )}
      </Canvas>
    </div>
  )
}
