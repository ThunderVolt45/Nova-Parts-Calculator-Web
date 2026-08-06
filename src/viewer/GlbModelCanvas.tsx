import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { OrbitControls } from '@react-three/drei'
import { Canvas, useThree } from '@react-three/fiber'
import { PerspectiveCamera, Vector3, type Object3D } from 'three'
import type { OrbitControls as OrbitControlsImplementation } from 'three-stdlib'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

import { fitPerspectiveCameraToObject } from './camera-fit.ts'
import { disposeModelObject } from './disposeModel.ts'
import { centerModelPivot } from './model-pivot.ts'
import { observeWebGlContextLoss } from './webgl-context-recovery.ts'

interface GlbModelCanvasProps {
  readonly glb: ArrayBuffer
  readonly resetToken: number
  readonly label: string
  onReady(): void
  onError(error: Error): void
}

const DEFAULT_MODEL_VIEW_DIRECTION = new Vector3(2, 1.4, 3)

function ContextLossRecovery({ onContextLost }: { onContextLost(): void }) {
  const gl = useThree((state) => state.gl)

  useEffect(
    () => observeWebGlContextLoss(gl.domElement, onContextLost),
    [gl, onContextLost],
  )

  return null
}

function FittedModel({
  object,
  resetToken,
  controls,
}: {
  readonly object: Object3D
  readonly resetToken: number
  readonly controls: React.RefObject<OrbitControlsImplementation | null>
}) {
  const camera = useThree((state) => state.camera)
  const size = useThree((state) => state.size)
  const invalidate = useThree((state) => state.invalidate)
  const previousResetTokenRef = useRef(resetToken)
  useLayoutEffect(() => {
    if (!(camera instanceof PerspectiveCamera) || !controls.current) return
    const resetRotation = previousResetTokenRef.current !== resetToken
    previousResetTokenRef.current = resetToken
    fitPerspectiveCameraToObject(
      camera,
      object,
      controls.current,
      size,
      1.25,
      resetRotation ? DEFAULT_MODEL_VIEW_DIRECTION : undefined,
    )
    invalidate()
  }, [camera, controls, invalidate, object, resetToken, size])
  return <primitive object={object} dispose={null} />
}

export function GlbModelCanvas({
  glb,
  resetToken,
  label,
  onReady,
  onError,
}: GlbModelCanvasProps) {
  const [object, setObject] = useState<Object3D | null>(null)
  const [contextRecoveryToken, setContextRecoveryToken] = useState(0)
  const controls = useRef<OrbitControlsImplementation>(null)
  const recoveryTimerRef = useRef<number | null>(null)
  const onReadyRef = useRef(onReady)
  const onErrorRef = useRef(onError)
  onReadyRef.current = onReady
  onErrorRef.current = onError

  const recoverLostContext = useCallback(() => {
    if (recoveryTimerRef.current !== null) return
    recoveryTimerRef.current = window.setTimeout(() => {
      recoveryTimerRef.current = null
      setContextRecoveryToken((token) => token + 1)
    }, 0)
  }, [])

  useEffect(
    () => () => {
      if (recoveryTimerRef.current !== null) {
        window.clearTimeout(recoveryTimerRef.current)
      }
    },
    [],
  )

  useEffect(() => {
    let cancelled = false
    let loaded: Object3D | null = null
    setObject(null)
    const loader = new GLTFLoader()
    loader.parseAsync(glb, '').then(
      (gltf) => {
        loaded = gltf.scene
        centerModelPivot(loaded)
        if (cancelled) {
          disposeModelObject(loaded)
          return
        }
        setObject(loaded)
        onReadyRef.current()
      },
      (error: unknown) => {
        if (!cancelled) {
          onErrorRef.current(
            error instanceof Error ? error : new Error('GLB 장면을 읽지 못했습니다.'),
          )
        }
      },
    )
    return () => {
      cancelled = true
      if (loaded) disposeModelObject(loaded)
    }
  }, [glb])

  return (
    <div className="model-canvas" aria-label={label}>
      <Canvas
        key={contextRecoveryToken}
        camera={{ position: [2, 1.4, 3], fov: 42, near: 0.01, far: 100_000 }}
        dpr={[1, 1.5]}
        frameloop="demand"
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      >
        <ContextLossRecovery onContextLost={recoverLostContext} />
        <ambientLight intensity={1.6} />
        <hemisphereLight args={['#b8f7ff', '#071015', 1.8]} />
        <directionalLight position={[4, 7, 5]} intensity={2.4} />
        <directionalLight position={[-4, 2, -3]} intensity={0.8} color="#45c8dd" />
        <OrbitControls
          ref={controls}
          makeDefault
          target={[0, 0, 0]}
          enableDamping
          dampingFactor={0.08}
          minDistance={0.01}
          maxDistance={100_000}
        />
        {object && (
          <FittedModel
            object={object}
            resetToken={resetToken}
            controls={controls}
          />
        )}
      </Canvas>
    </div>
  )
}
