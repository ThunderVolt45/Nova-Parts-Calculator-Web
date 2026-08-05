import { useEffect, useMemo, useState, type ChangeEvent } from 'react'

import {
  indexDirectoryInputFiles,
  type LocalResourceIndex,
} from './local-files.ts'
import { LAB_UI_FILE_NAME } from './lab-ui-atlas.ts'
import { useLabUiSpriteState } from './lab-ui-sprite-context.ts'
import { gxResourceMap, resolvePartModel } from './resource-map.ts'
import {
  modelCacheRepository,
  type ModelCacheRepository,
  type ModelCacheStats,
} from './model-cache.ts'
import {
  precacheMappedModels,
  type ModelPrecacheProgress,
  type ModelPrecacheResult,
} from './model-precache.ts'
import { GxParserWorkerClient } from './parser/worker-client.ts'

interface LocalResourceConnectorProps {
  index: LocalResourceIndex | null
  onIndexChange(index: LocalResourceIndex): void
  cache?: Pick<ModelCacheRepository, 'stats' | 'clear'>
  modelCache?: ModelCacheRepository
}

type ConnectionStatus = 'idle' | 'indexing' | 'ready' | 'error'
const DEFAULT_COMMON_PATH = String.raw`C:\Program Files (x86)\Nova1492\datan\common`

function getErrorMessage(error: unknown) {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return '폴더 선택을 취소했습니다.'
  }
  return error instanceof Error ? error.message : '폴더를 읽지 못했습니다.'
}

export function LocalResourceConnector({
  index,
  onIndexChange,
  cache,
  modelCache = modelCacheRepository,
}: LocalResourceConnectorProps) {
  const cacheControls = cache ?? modelCache
  const [status, setStatus] = useState<ConnectionStatus>(index ? 'ready' : 'idle')
  const [message, setMessage] = useState('')
  const labUi = useLabUiSpriteState()
  const [cacheStats, setCacheStats] = useState<ModelCacheStats | null>(null)
  const [cacheStatus, setCacheStatus] = useState<'loading' | 'ready' | 'clearing' | 'error'>(
    'loading',
  )
  const [precacheProgress, setPrecacheProgress] = useState<ModelPrecacheProgress | null>(null)
  const [precacheResult, setPrecacheResult] = useState<ModelPrecacheResult | null>(null)
  const [precacheRunning, setPrecacheRunning] = useState(false)

  useEffect(() => {
    let cancelled = false
    cacheControls.stats().then(
      (stats) => {
        if (!cancelled) {
          setCacheStats(stats)
          setCacheStatus('ready')
        }
      },
      () => {
        if (!cancelled) setCacheStatus('error')
      },
    )
    return () => {
      cancelled = true
    }
  }, [cacheControls])

  useEffect(() => {
    if (!index) return
    let cancelled = false
    const controller = new AbortController()
    const worker = new GxParserWorkerClient()
    setPrecacheRunning(true)
    setPrecacheResult(null)
    void navigator.storage?.persist?.().catch(() => false)
    precacheMappedModels({
      index,
      cache: modelCache,
      worker,
      signal: controller.signal,
      onProgress(progress) {
        if (!cancelled) setPrecacheProgress(progress)
      },
    }).then(
      async (result) => {
        if (cancelled) return
        setPrecacheResult(result)
        setPrecacheProgress(result)
        setPrecacheRunning(false)
        setCacheStats(await cacheControls.stats())
        setCacheStatus('ready')
      },
      () => {
        if (!cancelled) {
          setPrecacheRunning(false)
          setCacheStatus('error')
        }
      },
    ).finally(() => worker.terminate())
    return () => {
      cancelled = true
      controller.abort()
      worker.terminate()
    }
  }, [cacheControls, index, modelCache])

  const coverage = useMemo(() => {
    if (!index) return null
    let available = 0
    let missing = 0
    let unresolved = 0

    for (const mapping of gxResourceMap.items) {
      const resolution = resolvePartModel(mapping.kind, mapping.partId, index)
      if (resolution.status === 'available') available += 1
      if (resolution.status === 'missing-source') missing += 1
      if (resolution.status === 'unresolved') unresolved += 1
    }

    return {
      available,
      missing,
      unresolved,
      hasLabUi: Boolean(index.find(LAB_UI_FILE_NAME)),
    }
  }, [index])

  const connectFallback = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.currentTarget.files
    if (!files || files.length === 0) return

    setStatus('indexing')
    setMessage('')
    try {
      const nextIndex = indexDirectoryInputFiles(files)
      onIndexChange(nextIndex)
      setStatus('ready')
    } catch (error) {
      setStatus('error')
      setMessage(getErrorMessage(error))
    }
  }

  const clearCache = async () => {
    if (!window.confirm('변환된 3D 모델 캐시를 모두 삭제할까요? 원본 게임 파일은 변경되지 않습니다.')) {
      return
    }
    setCacheStatus('clearing')
    try {
      await cacheControls.clear()
      setCacheStats(await cacheControls.stats())
      setCacheStatus('ready')
    } catch {
      setCacheStatus('error')
    }
  }

  return (
    <div
      className={`gx-connector ${status === 'ready' && index ? 'is-ready' : ''}`}
      aria-live="polite"
    >
      <span className="prototype-badge">LOCAL GX · READ ONLY</span>
      {status === 'ready' && index && coverage ? (
        <>
          <strong>{index.size.toLocaleString('ko-KR')}개 파일 연결됨</strong>
          <p>
            모델 {coverage.available}개 확인 · 누락 {coverage.missing}개 · 매핑 미해결{' '}
            {coverage.unresolved}개 · lab_ui {coverage.hasLabUi ? '확인' : '누락'}
          </p>
        </>
      ) : (
        <>
          <strong>
            {status === 'indexing' ? '로컬 파일 인덱싱 중…' : '게임 리소스 폴더 연결'}
          </strong>
          <p>Nova 1492의 datan/common을 선택하세요. 파일은 서버로 전송되지 않습니다.</p>
          <p className="gx-default-path">
            기본 설치 경로 <code>{DEFAULT_COMMON_PATH}</code>
          </p>
        </>
      )}

      <div className="gx-connector-actions">
        <label className="gx-directory-fallback">
          다른 방식으로 선택
          <input
            type="file"
            multiple
            ref={(input) => input?.setAttribute('webkitdirectory', '')}
            aria-label="Nova 1492 common 폴더"
            onChange={connectFallback}
            disabled={status === 'indexing'}
          />
        </label>
      </div>
      <div className="gx-cache-status">
        <span>
          모델 캐시{' '}
          {cacheStatus === 'loading'
            ? '확인 중…'
            : cacheStatus === 'error'
              ? '확인 실패'
              : `${cacheStats?.entryCount ?? 0}개 · ${formatBytes(cacheStats?.totalBytes ?? 0)}`}
        </span>
        <button
          type="button"
          onClick={clearCache}
          disabled={precacheRunning || cacheStatus === 'loading' || cacheStatus === 'clearing' || !cacheStats?.entryCount}
        >
          {cacheStatus === 'clearing' ? '삭제 중…' : '전체 삭제'}
        </button>
      </div>
      {precacheProgress && (
        <p className="gx-precache-progress">
          {precacheRunning ? 'GLB 일괄 변환 중' : 'GLB 캐시 준비 완료'} ·{' '}
          {precacheProgress.completed}/{precacheProgress.total}
          {' '}· 변환 {precacheProgress.converted} · 캐시 적중 {precacheProgress.cacheHits}
          {precacheProgress.failed > 0 ? ` · 실패 ${precacheProgress.failed}` : ''}
        </p>
      )}
      {precacheResult && precacheResult.failed > 0 && (
        <p className="gx-connector-error">
          {precacheResult.failed}개 모델은 누락되었거나 변환하지 못했습니다. 나머지 캐시는 정상적으로 사용할 수 있습니다.
        </p>
      )}
      {status === 'error' && <p className="gx-connector-error">{message}</p>}
      {status === 'ready' && labUi.status === 'loading' && (
        <p>lab_ui 스프라이트 추출 중…</p>
      )}
      {status === 'ready' && labUi.status === 'ready' && (
        <p>원작 타입·서브코어 스프라이트 15개 준비됨</p>
      )}
      {status === 'ready' && labUi.status === 'error' && (
        <p className="gx-connector-error">{labUi.error}</p>
      )}
    </div>
  )
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}
