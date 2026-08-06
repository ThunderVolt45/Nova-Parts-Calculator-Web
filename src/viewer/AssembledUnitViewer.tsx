import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

import type { LocalResourceIndex } from '../gx/local-files.ts'
import {
  loadOrBuildModel,
  loadCachedModel,
  ModelAccessError,
  type LoadModelOptions,
  type LoadedModel,
  type ModelPipelineStage,
  type ModelPipelineWorker,
} from '../gx/model-pipeline.ts'
import {
  modelCacheRepository,
  type ModelCacheRepository,
} from '../gx/model-cache.ts'
import { GxParserWorkerClient } from '../gx/parser/worker-client.ts'
import {
  getPartResourceMapping,
  resolvePartModel,
  type ModelPartKind,
} from '../gx/resource-map.ts'
import {
  buildPartialUnitSocketAssembly,
  type PartialUnitSocketAssembly,
} from '../gx/socket-assembly.ts'
import { useViewerCapability, type ViewerCapability } from './capability.ts'
import type { AssembledUnitCanvasProps } from './AssembledUnitCanvas.tsx'
import type { ViewerCameraState } from './camera-state.ts'
import type { ViewerDisplayState } from './StandalonePartViewer.tsx'
import type {
  UnitAnimationClip,
  UnitAnimationPlayback,
} from './unit-animation.ts'

const LazyAssembledUnitCanvas = lazy(async () => {
  const module = await import('./AssembledUnitCanvas.tsx')
  return { default: module.AssembledUnitCanvas }
})

type WorkerWithLifecycle = ModelPipelineWorker & { terminate?(): void }
type UnitPartKind = Exclude<ModelPartKind, 'accessory'>
type UnitPartSelection = Record<UnitPartKind, { readonly id: number; readonly name: string }>

interface LoadedAssembly {
  readonly parts: Partial<Record<UnitPartKind, LoadedModel>>
  readonly sockets: PartialUnitSocketAssembly
}

interface AssembledUnitViewerProps {
  readonly parts: UnitPartSelection
  readonly mountCompatible: boolean
  readonly index: LocalResourceIndex | null
  readonly resetToken: number
  readonly animation?: UnitAnimationPlayback
  onStateChange?(state: ViewerDisplayState): void
  onAnimationClipsChange?(clips: readonly UnitAnimationClip[]): void
  onCameraStateChange?(state: ViewerCameraState): void
  onInteractionStart?(): void
  readonly capabilityOverride?: ViewerCapability
  readonly cache?: ModelCacheRepository
  readonly workerFactory?: () => WorkerWithLifecycle
  readonly loadModel?: (options: LoadModelOptions) => Promise<LoadedModel>
  readonly renderScene?: (props: AssembledUnitCanvasProps) => ReactNode
}

const partLabels: Record<UnitPartKind, string> = {
  leg: '다리',
  body: '몸통',
  weapon: '무기',
}
const unitPartKinds = Object.keys(partLabels) as UnitPartKind[]

const progressMessages: Record<ModelPipelineStage, string> = {
  'checking-permission': '읽기 권한 확인 중…',
  'parsing-gx': 'GX 파싱 중…',
  'checking-cache': '모델 캐시 확인 중…',
  'loading-resources': 'XFI와 텍스처 읽는 중…',
  'converting-glb': 'GLB 변환 중…',
  'saving-cache': '모델 캐시 저장 중…',
}

const createParserWorker = () => new GxParserWorkerClient()

function Placeholder({ message }: { readonly message: string }) {
  return (
    <div className="model-unavailable-notice">
      <strong>{message.startsWith('모델링 정보 없음') ? '모델링 정보 없음' : message}</strong>
      {message.startsWith('모델링 정보 없음') && (
        <span>프리뷰 기능을 이용하려면 GX 파일을 불러와야 합니다.</span>
      )}
    </div>
  )
}

export function AssembledUnitViewer({
  parts,
  mountCompatible,
  index,
  resetToken,
  animation,
  onStateChange,
  onAnimationClipsChange,
  onCameraStateChange,
  onInteractionStart,
  capabilityOverride,
  cache = modelCacheRepository,
  workerFactory = createParserWorker,
  loadModel = loadOrBuildModel,
  renderScene,
}: AssembledUnitViewerProps) {
  const detectedCapability = useViewerCapability()
  const capability = capabilityOverride ?? detectedCapability
  const legId = parts.leg.id
  const bodyId = parts.body.id
  const weaponId = parts.weapon.id
  const [display, setDisplay] = useState<ViewerDisplayState>({
    status: 'offline',
    message: '게임 리소스 폴더를 연결하면 조립 유닛을 표시합니다.',
  })
  const [assembly, setAssembly] = useState<LoadedAssembly | null>(null)
  const onStateChangeRef = useRef(onStateChange)
  onStateChangeRef.current = onStateChange
  const resolutions = useMemo(() => index
    ? {
        leg: resolvePartModel('leg', legId, index),
        body: resolvePartModel('body', bodyId, index),
        weapon: resolvePartModel('weapon', weaponId, index),
      }
    : null,
  [bodyId, index, legId, weaponId])
  const mappings = useMemo(() => ({
    leg: getPartResourceMapping('leg', legId),
    body: getPartResourceMapping('body', bodyId),
    weapon: getPartResourceMapping('weapon', weaponId),
  }), [bodyId, legId, weaponId])

  const updateDisplay = (state: ViewerDisplayState) => {
    setDisplay(state)
    onStateChangeRef.current?.(state)
  }

  useEffect(() => {
    setAssembly(null)
    if (!capability.supported) {
      updateDisplay({
        status: 'pc-only',
        message: capability.reason ?? '3D 모델을 사용할 수 없습니다.',
      })
      return
    }
    const selectedIds: Record<UnitPartKind, number> = {
      leg: legId,
      body: bodyId,
      weapon: weaponId,
    }
    const availableKinds = unitPartKinds.filter((kind) =>
      selectedIds[kind] > 0
      && mappings[kind]?.mappingStatus === 'mapped'
      && Boolean(mappings[kind]?.sourceGx),
    )
    if (availableKinds.length === 0) {
      const unselected = unitPartKinds.filter((kind) => selectedIds[kind] <= 0)
      updateDisplay({
        status: unselected.length === unitPartKinds.length ? 'empty' : 'missing',
        message: unselected.length === unitPartKinds.length
          ? '프리뷰할 부품을 하나 이상 선택하세요.'
          : '선택한 부품에서 사용할 수 있는 GX 모델을 찾지 못했습니다.',
      })
      return
    }

    let cancelled = false
    const worker = index ? workerFactory() : null
    updateDisplay({
      status: 'loading',
      message: index ? '선택된 부품 프리뷰 준비 중…' : '저장된 조립 GLB 캐시 확인 중…',
    })
    const loadPart = async (kind: UnitPartKind) => {
      const resolution = resolutions?.[kind]
      if (index && worker && resolution?.status === 'available') {
        return loadModel({
          source: resolution.file,
          index,
          cache,
          worker,
          includeSocketMetadata: true,
          onProgress(stage) {
            if (!cancelled) {
              updateDisplay({
                status: 'loading',
                message: `${partLabels[kind]} · ${progressMessages[stage]}`,
              })
            }
          },
        })
      }
      const sourceName = mappings[kind]?.sourceGx
      const cached = sourceName ? await loadCachedModel(sourceName, cache) : null
      if (!cached) throw new Error(`${partLabels[kind]} 모델 캐시를 찾지 못했습니다.`)
      return cached
    }
    Promise.allSettled(availableKinds.map(async (kind) => [kind, await loadPart(kind)] as const)).then(
      (results) => {
        if (cancelled) return
        const loadedParts = results.flatMap((result) =>
          result.status === 'fulfilled' ? [result.value] : [],
        )
        if (loadedParts.length === 0) {
          updateDisplay({
            status: index ? 'missing' : 'offline',
            message: index
              ? '선택한 부품에서 사용할 수 있는 GX 모델을 찾지 못했습니다.'
              : '저장된 조립 모델이 없습니다. 게임 리소스 폴더를 연결해 주세요.',
          })
          return
        }
        const loaded = Object.fromEntries(loadedParts) as Partial<
          Record<UnitPartKind, LoadedModel>
        >
        const sockets = buildPartialUnitSocketAssembly(
          loaded.leg?.socketMetadata ?? null,
          loaded.body?.socketMetadata ?? null,
        )
        setAssembly({ parts: loaded, sockets })
        updateDisplay({
          status: 'scene-loading',
          message: 'Three.js 부품 장면 준비 중…',
          cacheStatus: loadedParts.every(([, item]) => item.cacheStatus === 'hit')
            ? 'hit'
            : 'miss',
        })
      },
      (error: unknown) => {
        if (cancelled) return
        updateDisplay({
          status: 'error',
          message: error instanceof ModelAccessError
            ? error.message
            : error instanceof Error
              ? error.message
              : '선택된 부품 모델을 준비하지 못했습니다.',
        })
      },
    ).catch((error: unknown) => {
      if (!cancelled) {
        updateDisplay({
          status: 'error',
          message: error instanceof Error
            ? error.message
            : '소켓 조립 변환을 계산하지 못했습니다.',
        })
      }
    })
    return () => {
      cancelled = true
      worker?.terminate?.()
    }
  }, [
    cache,
    capability.reason,
    capability.supported,
    index,
    loadModel,
    mappings,
    bodyId,
    legId,
    resolutions,
    workerFactory,
    weaponId,
  ])

  const loadedModels = assembly ? Object.values(assembly.parts) : []
  const missingKinds = assembly
    ? unitPartKinds.filter((kind) => !assembly.parts[kind])
    : []
  const cacheStatus = loadedModels.length > 0
    ? loadedModels.every((item) => item.cacheStatus === 'hit')
      ? 'hit'
      : 'miss'
    : undefined
  const warnings = [
    !mountCompatible ? '몸통과 무기 타입 불일치' : null,
    missingKinds.length > 0
      ? `${missingKinds.map((kind) => partLabels[kind]).join(', ')} 누락`
      : null,
  ].filter((warning): warning is string => Boolean(warning))
  const sceneProps: AssembledUnitCanvasProps | null = assembly
    ? {
        legsGlb: assembly.parts.leg?.glb,
        bodyGlb: assembly.parts.body?.glb,
        weaponGlb: assembly.parts.weapon?.glb,
        bodyTransform: assembly.sockets.bodyTransform,
        weaponTransform: assembly.sockets.weaponTransform,
        socketChain: assembly.sockets,
        resetToken,
        animation,
        label: `${parts.leg.name}, ${parts.body.name}, ${parts.weapon.name} 조립 유닛 3D 모델`,
        onAnimationClipsChange,
        onCameraStateChange,
        onInteractionStart,
        onReady: () => updateDisplay({
          status: 'ready',
          message: missingKinds.length > 0
            ? '일부 부품만 진단용으로 표시 중'
            : mountCompatible
              ? '프리뷰 준비 완료'
              : '진단용 3D 조립 표시 중',
          cacheStatus,
          warning: warnings.length > 0 ? `조립 불가 · ${warnings.join(' · ')}` : undefined,
        }),
        onError: (error) => updateDisplay({
          status: 'error',
          message: error.message,
          cacheStatus,
        }),
      }
    : null

  return (
    <div className={`standalone-viewer assembled-unit-viewer is-${display.status}`}>
      {sceneProps
        ? renderScene
          ? renderScene(sceneProps)
          : (
              <Suspense fallback={<Placeholder message="3D 조립 장면 준비 중…" />}>
                <LazyAssembledUnitCanvas {...sceneProps} />
              </Suspense>
            )
        : (
            <Placeholder
              message={display.status === 'offline'
                ? '모델링 정보 없음 - 프리뷰 기능을 이용하려면 GX 파일을 불러와야 합니다.'
                : display.status === 'loading' || display.status === 'scene-loading'
                  ? display.message
                  : '모델링 정보 없음'}
            />
          )}
      {warnings.length > 0 && (
        <div className="assembly-viewer-warning" role="alert">
          <strong>조립 불가</strong>
          <span>{warnings.join(' · ')} · 소켓 배치는 진단용입니다.</span>
        </div>
      )}
      {display.status !== 'ready' && (
        <div className="model-viewer-status" role="status" aria-live="polite">
          <span className={`model-viewer-status-dot is-${display.status}`} aria-hidden="true" />
          <strong>조립 유닛</strong>
          <span>{display.message}</span>
        </div>
      )}
    </div>
  )
}
