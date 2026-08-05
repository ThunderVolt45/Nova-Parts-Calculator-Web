import { useEffect, useMemo, useState } from 'react'

import type { LocalResourceIndex } from '../gx/local-files.ts'
import {
  loadOrBuildModel,
  loadCachedModel,
  type LoadModelOptions,
  type LoadedModel,
  type ModelPipelineWorker,
} from '../gx/model-pipeline.ts'
import { modelCacheRepository } from '../gx/model-cache.ts'
import { GxParserWorkerClient } from '../gx/parser/worker-client.ts'
import { getPartResourceMapping, resolvePartModel, type ModelPartKind } from '../gx/resource-map.ts'
import { buildUnitSocketAssembly } from '../gx/socket-assembly.ts'
import { useViewerCapability, type ViewerCapability } from './capability.ts'
import type { UnitThumbnailInput } from './thumbnail-renderer.ts'

type WorkerWithLifecycle = ModelPipelineWorker & { terminate?(): void }
type ThumbnailStatus = 'offline' | 'loading' | 'ready' | 'unavailable' | 'pc-only'

const noGxMessage = '모델링 정보 없음 - 프리뷰 기능을 이용하려면 GX 파일을 불러와야 합니다.'
const createParserWorker = () => new GxParserWorkerClient()
const defaultPartRenderer = async (glb: ArrayBuffer) => {
  const module = await import('./thumbnail-renderer.ts')
  return module.renderPartThumbnail(glb)
}
const defaultUnitRenderer = async (input: UnitThumbnailInput) => {
  const module = await import('./thumbnail-renderer.ts')
  return module.renderUnitThumbnail(input)
}

function ThumbnailSurface({
  status,
  url,
  label,
}: {
  readonly status: ThumbnailStatus
  readonly url: string | null
  readonly label: string
}) {
  if (url) {
    return <img className="model-thumbnail-image" src={url} alt={`${label} 3D 프리뷰`} />
  }
  const message = status === 'loading'
    ? '3D 모델 준비 중…'
    : status === 'pc-only'
      ? '3D 프리뷰는 PC 전용입니다.'
      : status === 'unavailable'
        ? '모델링 정보 없음'
        : noGxMessage
  return (
    <span className={`model-thumbnail-empty is-${status}`} aria-label={message}>
      {status === 'offline' ? (
        <>
          <strong>모델링 정보 없음</strong>
          <small>프리뷰 기능을 이용하려면 GX 파일을 불러와야 합니다.</small>
        </>
      ) : <strong>{message}</strong>}
    </span>
  )
}

export interface PartModelThumbnailProps {
  readonly kind: ModelPartKind
  readonly partId: number
  readonly partName: string
  readonly index: LocalResourceIndex | null
  readonly capabilityOverride?: ViewerCapability
  readonly workerFactory?: () => WorkerWithLifecycle
  readonly loadModel?: (options: LoadModelOptions) => Promise<LoadedModel>
  readonly renderThumbnail?: (glb: ArrayBuffer) => Promise<string>
}

export function PartModelThumbnail({
  kind,
  partId,
  partName,
  index,
  capabilityOverride,
  workerFactory = createParserWorker,
  loadModel = loadOrBuildModel,
  renderThumbnail = defaultPartRenderer,
}: PartModelThumbnailProps) {
  const detectedCapability = useViewerCapability()
  const capability = capabilityOverride ?? detectedCapability
  const [state, setState] = useState<{ status: ThumbnailStatus; url: string | null }>({
    status: 'offline',
    url: null,
  })
  const resolution = useMemo(
    () => index && partId > 0 ? resolvePartModel(kind, partId, index) : null,
    [index, kind, partId],
  )
  const mapping = useMemo(
    () => partId > 0 ? getPartResourceMapping(kind, partId) : undefined,
    [kind, partId],
  )

  useEffect(() => {
    if (!capability.supported) {
      setState({ status: 'pc-only', url: null })
      return
    }
    if (partId <= 0 || mapping?.mappingStatus !== 'mapped' || !mapping.sourceGx) {
      setState({ status: 'unavailable', url: null })
      return
    }
    let cancelled = false
    const worker = index && resolution?.status === 'available' ? workerFactory() : null
    setState({ status: 'loading', url: null })
    const pending = index && resolution?.status === 'available' && worker
      ? loadModel({
          source: resolution.file,
          index,
          cache: modelCacheRepository,
          worker,
        })
      : loadCachedModel(mapping.sourceGx, modelCacheRepository)
    pending.then((model) => {
      if (!model) throw new Error('저장된 GLB 모델이 없습니다.')
      return renderThumbnail(model.glb)
    }).then(
      (url) => {
        if (!cancelled) setState({ status: 'ready', url })
      },
      () => {
        if (!cancelled) setState({ status: index ? 'unavailable' : 'offline', url: null })
      },
    )
    return () => {
      cancelled = true
      worker?.terminate?.()
    }
  }, [capability.supported, index, loadModel, mapping, partId, renderThumbnail, resolution, workerFactory])

  return <ThumbnailSurface status={state.status} url={state.url} label={partName} />
}

type UnitParts = {
  readonly leg: number
  readonly body: number
  readonly weapon: number
}

export interface UnitModelThumbnailProps {
  readonly parts: UnitParts
  readonly name: string
  readonly index: LocalResourceIndex | null
  readonly capabilityOverride?: ViewerCapability
  readonly workerFactory?: () => WorkerWithLifecycle
  readonly loadModel?: (options: LoadModelOptions) => Promise<LoadedModel>
  readonly renderThumbnail?: (input: UnitThumbnailInput) => Promise<string>
}

export function UnitModelThumbnail({
  parts,
  name,
  index,
  capabilityOverride,
  workerFactory = createParserWorker,
  loadModel = loadOrBuildModel,
  renderThumbnail = defaultUnitRenderer,
}: UnitModelThumbnailProps) {
  const detectedCapability = useViewerCapability()
  const capability = capabilityOverride ?? detectedCapability
  const [state, setState] = useState<{ status: ThumbnailStatus; url: string | null }>({
    status: 'offline',
    url: null,
  })
  const legId = parts.leg
  const bodyId = parts.body
  const weaponId = parts.weapon
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

  useEffect(() => {
    if (!capability.supported) {
      setState({ status: 'pc-only', url: null })
      return
    }
    if (
      Object.values(mappings).some((mapping) =>
        mapping?.mappingStatus !== 'mapped' || !mapping.sourceGx,
      )
    ) {
      setState({ status: 'unavailable', url: null })
      return
    }
    let cancelled = false
    const worker = index ? workerFactory() : null
    setState({ status: 'loading', url: null })
    const load = async (kind: 'leg' | 'body' | 'weapon') => {
      const resolution = resolutions?.[kind]
      if (index && worker && resolution?.status === 'available') {
        return loadModel({
          source: resolution.file,
          index,
          cache: modelCacheRepository,
          worker,
          includeSocketMetadata: true,
        })
      }
      const sourceName = mappings[kind]?.sourceGx
      const cached = sourceName
        ? await loadCachedModel(sourceName, modelCacheRepository)
        : null
      if (!cached) throw new Error('저장된 GLB 모델 누락')
      return cached
    }
    Promise.all([load('leg'), load('body'), load('weapon')]).then(
      async ([legs, body, weapon]) => {
        if (!legs.socketMetadata || !body.socketMetadata) {
          throw new Error('소켓 메타데이터 누락')
        }
        const sockets = buildUnitSocketAssembly(legs.socketMetadata, body.socketMetadata)
        return renderThumbnail({
          legsGlb: legs.glb,
          bodyGlb: body.glb,
          weaponGlb: weapon.glb,
          bodyTransform: sockets.bodyTransform,
          weaponTransform: sockets.weaponTransform,
        })
      },
    ).then(
      (url) => {
        if (!cancelled) setState({ status: 'ready', url })
      },
      () => {
        if (!cancelled) setState({ status: index ? 'unavailable' : 'offline', url: null })
      },
    )
    return () => {
      cancelled = true
      worker?.terminate?.()
    }
  }, [capability.supported, index, loadModel, mappings, renderThumbnail, resolutions, workerFactory])

  return <ThumbnailSurface status={state.status} url={state.url} label={name} />
}
