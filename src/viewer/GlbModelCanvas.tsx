import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { OrbitControls } from '@react-three/drei'
import { Canvas, useThree } from '@react-three/fiber'
import { PerspectiveCamera, type Object3D } from 'three'
import type { OrbitControls as OrbitControlsImplementation } from 'three-stdlib'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

import { fitPerspectiveCameraToObject } from './camera-fit.ts'
import { disposeModelObject } from './disposeModel.ts'
import { centerModelPivot } from './model-pivot.ts'

interface GlbModelCanvasProps {
  readonly glb: ArrayBuffer
  readonly resetToken: number
  readonly label: string
  onReady(): void
  onError(error: Error): void
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
  useLayoutEffect(() => {
    if (!(camera instanceof PerspectiveCamera) || !controls.current) return
    fitPerspectiveCameraToObject(camera, object, controls.current, size)
    invalidate()
  }, [camera, controls, invalidate, object, resetToken, size])
  return <primitive object={object} />
}

export function GlbModelCanvas({
  glb,
  resetToken,
  label,
  onReady,
  onError,
}: GlbModelCanvasProps) {
  const [object, setObject] = useState<Object3D | null>(null)
  const controls = useRef<OrbitControlsImplementation>(null)
  const onReadyRef = useRef(onReady)
  const onErrorRef = useRef(onError)
  onReadyRef.current = onReady
  onErrorRef.current = onError

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
        camera={{ position: [2, 1.4, 3], fov: 42, near: 0.01, far: 100_000 }}
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
