import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

import { getPartResourceMapping, resolvePartModel, type ModelPartKind } from '../gx/resource-map.ts'
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
  useViewerCapability,
  type ViewerCapability,
} from './capability.ts'

const LazyGlbModelCanvas = lazy(async () => {
  const module = await import('./GlbModelCanvas.tsx')
  return { default: module.GlbModelCanvas }
})

export type ViewerDisplayStatus =
  | 'offline'
  | 'pc-only'
  | 'empty'
  | 'unresolved'
  | 'missing'
  | 'loading'
  | 'scene-loading'
  | 'ready'
  | 'error'

export interface ViewerDisplayState {
  readonly status: ViewerDisplayStatus
  readonly message: string
  readonly cacheStatus?: 'hit' | 'miss'
  readonly warning?: string
}

type WorkerWithLifecycle = ModelPipelineWorker & { terminate?(): void }

interface StandalonePartViewerProps {
  readonly kind: ModelPartKind
  readonly partId: number
  readonly partName: string
  readonly index: LocalResourceIndex | null
  readonly resetToken: number
  onStateChange?(state: ViewerDisplayState): void
  readonly capabilityOverride?: ViewerCapability
  readonly cache?: ModelCacheRepository
  readonly workerFactory?: () => WorkerWithLifecycle
  readonly loadModel?: (options: LoadModelOptions) => Promise<LoadedModel>
  readonly renderScene?: (props: {
    glb: ArrayBuffer
    resetToken: number
    label: string
    onReady(): void
    onError(error: Error): void
  }) => ReactNode
}

const progressMessages: Record<ModelPipelineStage, string> = {
  'checking-permission': '게임 폴더 읽기 권한 확인 중…',
  'parsing-gx': 'GX 모델 파싱 중…',
  'checking-cache': '변환 모델 캐시 확인 중…',
  'loading-resources': 'XFI와 텍스처 읽는 중…',
  'converting-glb': 'GLB 모델 변환 중…',
  'saving-cache': '변환 모델 캐시 저장 중…',
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

export function StandalonePartViewer({
  kind,
  partId,
  partName,
  index,
  resetToken,
  onStateChange,
  capabilityOverride,
  cache = modelCacheRepository,
  workerFactory = createParserWorker,
  loadModel = loadOrBuildModel,
  renderScene,
}: StandalonePartViewerProps) {
  const detectedCapability = useViewerCapability()
  const capability = capabilityOverride ?? detectedCapability
  const [display, setDisplay] = useState<ViewerDisplayState>({
    status: 'offline',
    message: '게임 리소스 폴더를 연결하면 선택한 부품을 표시합니다.',
  })
  const [model, setModel] = useState<LoadedModel | null>(null)
  const onStateChangeRef = useRef(onStateChange)
  onStateChangeRef.current = onStateChange
  const resolution = useMemo(
    () => index && partId > 0 ? resolvePartModel(kind, partId, index) : null,
    [index, kind, partId],
  )
  const mapping = useMemo(
    () => partId > 0 ? getPartResourceMapping(kind, partId) : undefined,
    [kind, partId],
  )

  const updateDisplay = (state: ViewerDisplayState) => {
    setDisplay(state)
    onStateChangeRef.current?.(state)
  }

  useEffect(() => {
    setModel(null)
    if (!capability.supported) {
      updateDisplay({
        status: 'pc-only',
        message: capability.reason ?? '3D 모델을 사용할 수 없습니다.',
      })
      return
    }
    if (partId <= 0) {
      updateDisplay({ status: 'empty', message: '선택된 부품이 없습니다.' })
      return
    }
    if (!mapping) {
      updateDisplay({ status: 'unresolved', message: '부품 모델 매핑을 찾지 못했습니다.' })
      return
    }
    if (mapping.mappingStatus === 'unresolved' || !mapping.sourceGx) {
      updateDisplay({
        status: 'unresolved',
        message: `${mapping.partName}의 GX 모델 매핑이 아직 확인되지 않았습니다.`,
      })
      return
    }

    let cancelled = false
    if (!index) {
      updateDisplay({ status: 'loading', message: '저장된 GLB 모델 캐시 확인 중…' })
      loadCachedModel(mapping.sourceGx, cache).then(
        (loaded) => {
          if (cancelled) return
          if (!loaded) {
            updateDisplay({
              status: 'offline',
              message: '저장된 모델이 없습니다. 게임 리소스 폴더를 연결해 주세요.',
            })
            return
          }
          setModel(loaded)
          updateDisplay({
            status: 'scene-loading',
            message: '저장된 GLB 장면 준비 중…',
            cacheStatus: 'hit',
          })
        },
        (error: unknown) => {
          if (!cancelled) updateDisplay({
            status: 'error',
            message: error instanceof Error ? error.message : '모델 캐시를 읽지 못했습니다.',
          })
        },
      )
      return () => {
        cancelled = true
      }
    }
    if (!resolution || resolution.status === 'unknown-part') {
      updateDisplay({ status: 'unresolved', message: '부품 모델 매핑을 찾지 못했습니다.' })
      return
    }
    if (resolution.status === 'unresolved') {
      updateDisplay({ status: 'unresolved', message: '부품 모델 매핑을 찾지 못했습니다.' })
      return
    }
    if (resolution.status === 'missing-source') {
      updateDisplay({
        status: 'missing',
        message: `승인된 폴더에서 ${resolution.mapping.sourceGx} 파일을 찾지 못했습니다.`,
      })
      return
    }

    const worker = workerFactory()
    updateDisplay({ status: 'loading', message: progressMessages['checking-permission'] })
    const pending = loadModel({
      source: resolution.file,
      index,
      cache,
      worker,
      includeSocketMetadata: true,
      onProgress(stage) {
        if (!cancelled) updateDisplay({ status: 'loading', message: progressMessages[stage] })
      },
    })
    pending.then(
      (loaded) => {
        if (cancelled) return
        setModel(loaded)
        updateDisplay({
          status: 'scene-loading',
          message: 'Three.js 장면 준비 중…',
          cacheStatus: loaded.cacheStatus,
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
              : '3D 모델을 준비하지 못했습니다.',
        })
      },
    )
    void pending.finally(() => worker.terminate?.()).catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [cache, capability.reason, capability.supported, index, kind, loadModel, mapping, partId, resolution, workerFactory])

  const sceneProps = model
    ? {
        glb: model.glb,
        resetToken,
        label: `${partName} 3D 모델`,
        onReady: () => updateDisplay({
          status: 'ready',
          message: `${partName} 모델 준비됨`,
          cacheStatus: model.cacheStatus,
        }),
        onError: (error: Error) => updateDisplay({
          status: 'error',
          message: error.message,
          cacheStatus: model.cacheStatus,
        }),
      }
    : null

  return (
    <div className={`standalone-viewer is-${display.status}`}>
      {sceneProps
        ? renderScene
          ? renderScene(sceneProps)
          : (
              <Suspense fallback={<Placeholder message="3D 모델 준비 중…" />}>
                <LazyGlbModelCanvas {...sceneProps} />
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
      <div className="model-viewer-status" role="status" aria-live="polite">
        <span className={`model-viewer-status-dot is-${display.status}`} aria-hidden="true" />
        <strong>{partName || '부품 없음'}</strong>
        <span>{display.message}</span>
        {display.cacheStatus && (
          <em>{display.cacheStatus === 'hit' ? 'CACHE HIT' : 'CACHE MISS'}</em>
        )}
      </div>
    </div>
  )
}
