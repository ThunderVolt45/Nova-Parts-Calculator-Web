import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react'

import type { SavedUnit } from '../domain/deck/schema.ts'
import type { LocalResourceIndex } from '../gx/local-files.ts'
import {
  PartModelThumbnail,
  UnitModelThumbnail,
  type ModelThumbnailState,
} from '../viewer/ModelThumbnail.tsx'
import {
  buildUnitPngFilename,
  createUnitPngBlob,
  downloadUnitPng,
} from './unitPngExporter.ts'
import {
  createUnitPngLayout,
  UNIT_PNG_EXPORT_SIZE,
} from './unitPngLayout.ts'
import type { UnitThumbnailInput } from '../viewer/thumbnail-renderer.ts'

type UnitPngExportPreviewProps = {
  unit: SavedUnit
  resourceIndex: LocalResourceIndex | null
  dialogRef: RefObject<HTMLElement | null>
  closeButtonRef: RefObject<HTMLButtonElement | null>
  onClose: () => void
}

const abilitySlotLabels = {
  leg: '다리',
  body: '몸통',
  weapon: '무기',
  accessory: '액세서리',
} as const

type RenderPartSlot = keyof typeof abilitySlotLabels
type ExportNotice = { tone: 'success' | 'error'; text: string } | null

const emptyRenderState: ModelThumbnailState = { status: 'offline', url: null }
const emptyPartRenderStates: Record<RenderPartSlot, ModelThumbnailState> = {
  leg: emptyRenderState,
  body: emptyRenderState,
  weapon: emptyRenderState,
  accessory: emptyRenderState,
}

const renderExportPartThumbnail = async (glb: ArrayBuffer) => {
  const module = await import('../viewer/thumbnail-renderer.ts')
  return module.renderPartThumbnail(glb, { width: 320, height: 320, zoom: 0.8 })
}

const renderExportUnitThumbnail = async (input: UnitThumbnailInput) => {
  const module = await import('../viewer/thumbnail-renderer.ts')
  return module.renderUnitThumbnail(input, { width: 720, height: 900, zoom: 0.8 })
}

export function UnitPngExportPreview({
  unit,
  resourceIndex,
  dialogRef,
  closeButtonRef,
  onClose,
}: UnitPngExportPreviewProps) {
  const layout = useMemo(() => createUnitPngLayout(unit), [unit])
  const sheetRef = useRef<HTMLElement>(null)
  const [unitRenderState, setUnitRenderState] = useState(emptyRenderState)
  const [partRenderStates, setPartRenderStates] = useState(emptyPartRenderStates)
  const [isGenerating, setIsGenerating] = useState(false)
  const [exportNotice, setExportNotice] = useState<ExportNotice>(null)
  const requiredPartSlots = useMemo(
    () => layout.parts
      .filter((part) => unit.partIds[part.slot] > 0)
      .map((part) => part.slot),
    [layout.parts, unit.partIds],
  )
  const requiredRenderStates = [
    unitRenderState,
    ...requiredPartSlots.map((slot) => partRenderStates[slot]),
  ]
  const rendersReady = requiredRenderStates.every((state) => state.status === 'ready')
  const rendersLoading = requiredRenderStates.some((state) => state.status === 'loading')
  const pcOnly = requiredRenderStates.some((state) => state.status === 'pc-only')

  const updatePartRenderState = useCallback((
    slot: RenderPartSlot,
    state: ModelThumbnailState,
  ) => {
    setPartRenderStates((current) => {
      const previous = current[slot]
      return previous.status === state.status && previous.url === state.url
        ? current
        : { ...current, [slot]: state }
    })
  }, [])

  const updateUnitRenderState = useCallback((state: ModelThumbnailState) => {
    setUnitRenderState((current) =>
      current.status === state.status && current.url === state.url ? current : state,
    )
  }, [])

  const handlePngDownload = async () => {
    if (!rendersReady || !sheetRef.current || isGenerating) return
    setExportNotice(null)
    setIsGenerating(true)
    try {
      const blob = await createUnitPngBlob(sheetRef.current)
      downloadUnitPng(blob, buildUnitPngFilename(unit.name))
      setExportNotice({ tone: 'success', text: '1600×1000 PNG 파일을 만들었습니다.' })
    } catch (error) {
      setExportNotice({
        tone: 'error',
        text: error instanceof Error ? error.message : 'PNG 파일을 만들지 못했습니다.',
      })
    } finally {
      setIsGenerating(false)
    }
  }

  const renderStatus = exportNotice?.text
    ?? (isGenerating
      ? '1600×1000 PNG를 생성하는 중입니다…'
      : rendersReady
        ? '모든 부품과 조립 유닛 렌더가 준비되었습니다.'
        : rendersLoading
          ? 'PNG에 포함할 3D 렌더를 준비하는 중입니다…'
          : pcOnly
            ? 'PNG 내보내기의 3D 렌더는 PC에서 준비할 수 있습니다.'
            : 'PNG 저장에는 선택한 부품과 조립 유닛 모델이 모두 필요합니다. GX 폴더를 연결해 주세요.')

  return (
    <div className="unit-png-preview-backdrop" onMouseDown={onClose}>
      <section
        ref={dialogRef}
        className="unit-png-preview-dialog"
        role="dialog"
        tabIndex={-1}
        aria-modal="true"
        aria-labelledby="unit-png-preview-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="unit-png-preview-toolbar">
          <div>
            <span className="micro-label">PNG EXPORT</span>
            <h2 id="unit-png-preview-title">현재 유닛을 PNG로 내보내기</h2>
          </div>
          <div className="unit-png-preview-meta">
            <span>{UNIT_PNG_EXPORT_SIZE.width} × {UNIT_PNG_EXPORT_SIZE.height}</span>
            <span>16:10</span>
            <button
              className="unit-png-download-button"
              type="button"
              disabled={!rendersReady || isGenerating}
              aria-describedby="unit-png-export-status"
              onClick={() => void handlePngDownload()}
            >
              {isGenerating ? 'PNG 생성 중…' : 'PNG 파일로 저장'}
            </button>
            <button
              ref={closeButtonRef}
              className="unit-png-preview-close"
              type="button"
              aria-label="PNG 내보내기 닫기"
              onClick={onClose}
            >
              ×
            </button>
          </div>
        </header>

        <p
          id="unit-png-export-status"
          className={`unit-png-preview-note ${exportNotice ? `is-${exportNotice.tone}` : ''}`}
          role={exportNotice?.tone === 'error' ? 'alert' : 'status'}
        >
          {renderStatus} 파일은 브라우저에서 생성되며 서버로 전송되지 않습니다.
        </p>

        <div className="unit-png-preview-scroll">
          <article
            ref={sheetRef}
            className="unit-png-sheet"
            aria-label={`${layout.name} PNG 내보내기 내용`}
          >
            <header className="unit-png-sheet-header">
              <div className="unit-png-sheet-brand" aria-hidden="true">N</div>
              <div>
                <span>NOVA 1492 · UNIT BUILD RECORD</span>
                <h3>{layout.name}</h3>
              </div>
              <div className="unit-png-sheet-header-meta">
                <span>ASSEMBLY / BASE</span>
                <strong>UNIT SPEC SHEET</strong>
              </div>
            </header>

            <div className="unit-png-sheet-body">
              <section className="unit-png-parts-section" aria-label="부품 스펙 및 강화 정보">
                <div className="unit-png-section-heading">
                  <span>01 / PARTS</span>
                  <strong>부품 · 강화</strong>
                </div>
                <div className="unit-png-parts-grid">
                  {layout.parts.map((part) => (
                    <article className={`unit-png-part-card is-${part.slot}`} key={part.slot}>
                      <div
                        className="unit-png-part-thumbnail"
                        aria-label={`${part.slotLabel} 개별 렌더 이미지`}
                      >
                        <div className="unit-png-part-render-grid" aria-hidden="true" />
                        <PartModelThumbnail
                          kind={part.slot}
                          partId={unit.partIds[part.slot]}
                          partName={part.name}
                          index={resourceIndex}
                          deferModelLoad
                          renderThumbnail={renderExportPartThumbnail}
                          onStateChange={(state) => updatePartRenderState(part.slot, state)}
                        />
                      </div>
                      <div className="unit-png-part-copy">
                        <div className="unit-png-part-heading">
                          <span>{part.mark}</span>
                          <div>
                            <small>{part.slotLabel}</small>
                            <h4>{part.name}</h4>
                          </div>
                          <div className="unit-png-part-badges">
                            {part.badges.map((badge) => <b key={badge}>{badge}</b>)}
                          </div>
                        </div>
                        <div className="unit-png-part-stat-grid">
                          {part.primaryStats.map((stat) => (
                            <div
                              className={`unit-png-part-stat is-${stat.key}`}
                              key={stat.key}
                            >
                              <small>{stat.label}</small>
                              <strong>
                                <b>{stat.value}</b>
                                {stat.bonus && <em>{stat.bonus}</em>}
                              </strong>
                              {stat.reinforcementLevel !== null && (
                                <span>강화 {stat.reinforcementLevel}</span>
                              )}
                            </div>
                          ))}
                        </div>
                        <ul className="unit-png-part-specs">
                          {part.specs.map((spec) => <li key={spec}>{spec}</li>)}
                        </ul>
                        {part.reinforcement && (
                          <p className="unit-png-reinforcement">
                            <span>{part.slot === 'accessory' ? 'OPTION' : 'ENHANCE'}</span>
                            {part.reinforcement}
                          </p>
                        )}
                        {part.subcore && (
                          <p className="unit-png-subcore"><span>SUBCORE</span>{part.subcore}</p>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              </section>

              <section className="unit-png-render-card" aria-label="최종 조립 유닛 렌더 이미지">
                <div className="unit-png-section-heading">
                  <span>02 / ASSEMBLED UNIT</span>
                  <strong>조립 유닛 프리뷰</strong>
                </div>
                <div className="unit-png-render-grid" aria-hidden="true" />
                <div className="unit-png-render-model">
                  <UnitModelThumbnail
                    parts={unit.partIds}
                    name={unit.name}
                    index={resourceIndex}
                    renderThumbnail={renderExportUnitThumbnail}
                    onStateChange={updateUnitRenderState}
                  />
                </div>
                <span className="unit-png-render-caption">LEG + BODY + WEAPON</span>
              </section>

              <section className="unit-png-final-card" aria-label="최종 조립 스펙">
                <div className="unit-png-section-heading">
                  <span>03 / CALCULATION</span>
                  <strong>능력치</strong>
                </div>
                <p>BASE · 전투 시뮬레이션 효과 미적용</p>
                <div className="unit-png-weight-card">
                  <div>
                    <span>하중</span>
                    <strong>{layout.weight.used}<small> / {layout.weight.capacity}</small></strong>
                  </div>
                  <div className="unit-png-weight-meter" aria-hidden="true">
                    <i style={{ width: `${layout.weight.percent}%` }} />
                  </div>
                  <small>잔여 {layout.weight.remaining}</small>
                </div>
                <div className="unit-png-primary-stats">
                  {layout.primaryStats.map((stat) => (
                    <div className={`is-${stat.tone}`} key={stat.label}>
                      <span>{stat.mark}</span>
                      <div>
                        <small>{stat.label}</small>
                        <strong>{stat.value}</strong>
                      </div>
                    </div>
                  ))}
                </div>
                <dl className="unit-png-secondary-stats">
                  {layout.secondaryStats.map((stat) => (
                    <div key={stat.label}>
                      <dt>{stat.label}{stat.hint && <small>{stat.hint}</small>}</dt>
                      <dd>{stat.value}</dd>
                    </div>
                  ))}
                </dl>
                <section className="unit-png-abilities-card" aria-label="부품 특수 능력 정보">
                  <div className="unit-png-abilities-heading">
                    <span>SPECIAL ABILITIES</span>
                    <strong>유닛 특수 능력</strong>
                  </div>
                  <div className="unit-png-abilities-list">
                    {layout.abilities.map((ability) => (
                      <article key={ability.slot} className={`is-${ability.type}`}>
                        <span>{ability.type === 'active' ? 'C' : 'P'}</span>
                        <div>
                          <p>{ability.type === 'active' ? '액티브' : '패시브'} · {abilitySlotLabels[ability.slot]} · {ability.partName}</p>
                          <strong>{ability.text}</strong>
                        </div>
                      </article>
                    ))}
                    {layout.abilities.length === 0 && (
                      <p className="unit-png-abilities-empty">장착된 부품에 특수 능력이 없습니다.</p>
                    )}
                  </div>
                </section>
              </section>
            </div>

            <footer className="unit-png-sheet-footer">
              <span>NOVA ASSEMBLY · UNOFFICIAL FAN TOOL</span>
              <span>CATALOG {layout.catalogVersion}</span>
              <span>LOCAL RESOURCE / NO UPLOAD</span>
            </footer>
          </article>
        </div>
      </section>
    </div>
  )
}
