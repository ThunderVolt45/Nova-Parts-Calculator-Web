import { useEffect, useMemo, useRef, useState } from 'react'

import { partsCatalog, partsCatalogById } from '../data/catalog/catalog.ts'
import {
  DECK_SCHEMA_VERSION,
  DECK_SLOT_COUNT,
  copySavedUnit,
  savedUnitSchema,
  type SavedUnit,
} from '../domain/deck/schema.ts'
import { useDeckStore } from './store.ts'
import {
  createBackupExport,
  createDeckExport,
  createUnitExport,
  parseDeckImport,
  serializeDeckExport,
  type ImportResult,
} from './transfer.ts'

type UnitDraft = Omit<SavedUnit, 'name' | 'schemaVersion' | 'catalogVersion'>

type DeckPanelProps = {
  className?: string
  currentUnit: UnitDraft
  canRegisterUnit: boolean
  registrationIssues: string[]
  onLoadUnit: (unit: SavedUnit) => void
  onClearUnit: () => void
}

type Notice = { tone: 'success' | 'warning' | 'error'; text: string } | null
type PendingImport = { fileName: string; result: ImportResult } | null

export function DeckPanel({
  className = '',
  currentUnit,
  canRegisterUnit,
  registrationIssues,
  onLoadUnit,
  onClearUnit,
}: DeckPanelProps) {
  const {
    decks,
    activeDeckId,
    activeSlot,
    isHydrated,
    isSaving,
    error,
    initialize,
    createDeck,
    duplicateDeck,
    renameDeck,
    deleteDeck,
    selectDeck,
    selectSlot,
    saveUnit,
    removeUnit,
    importDecks,
    clearError,
  } = useDeckStore()
  const [unitName, setUnitName] = useState('UNIT-01')
  const [deckName, setDeckName] = useState('')
  const [copiedUnit, setCopiedUnit] = useState<SavedUnit | null>(null)
  const [pendingImport, setPendingImport] = useState<PendingImport>(null)
  const [notice, setNotice] = useState<Notice>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void initialize()
  }, [initialize])

  const activeDeck = useMemo(
    () => decks.find((deck) => deck.id === activeDeckId) ?? null,
    [activeDeckId, decks],
  )
  const selectedUnit = activeDeck?.slots[activeSlot] ?? null

  useEffect(() => {
    setDeckName(activeDeck?.name ?? '')
  }, [activeDeck?.id, activeDeck?.name])

  useEffect(() => {
    setUnitName(selectedUnit?.name ?? `UNIT-${String(activeSlot + 1).padStart(2, '0')}`)
  }, [activeSlot, selectedUnit?.name])

  useEffect(() => {
    if (error) setNotice({ tone: 'error', text: error })
  }, [error])

  const currentSavedUnit = () =>
    savedUnitSchema.parse({
      ...currentUnit,
      name: unitName.trim() || `UNIT-${String(activeSlot + 1).padStart(2, '0')}`,
      schemaVersion: DECK_SCHEMA_VERSION,
      catalogVersion: partsCatalog.catalogVersion,
    })

  const handleSave = async () => {
    if (!canRegisterUnit) {
      setNotice({
        tone: 'error',
        text: `유닛을 등록할 수 없습니다. ${registrationIssues.join(' ')}`,
      })
      return
    }
    clearError()
    await saveUnit(currentSavedUnit())
    setNotice({
      tone: 'success',
      text: `${activeSlot + 1}번 슬롯에 유닛을 등록했습니다.`,
    })
  }

  const handleRename = async () => {
    const trimmedName = deckName.trim()
    if (!activeDeck || !trimmedName || trimmedName === activeDeck.name) {
      setDeckName(activeDeck?.name ?? '')
      return
    }
    await renameDeck(trimmedName)
    setNotice({ tone: 'success', text: `덱 이름을 ${trimmedName}(으)로 변경했습니다.` })
  }

  const handleDeleteDeck = async () => {
    if (!activeDeck) return
    if (!window.confirm(`“${activeDeck.name}” 덱을 삭제할까요? 이 작업은 되돌릴 수 없습니다.`)) {
      return
    }
    await deleteDeck()
    setNotice({ tone: 'success', text: `${activeDeck.name} 덱을 삭제했습니다.` })
  }

  const handleCopyUnit = () => {
    if (!selectedUnit) return
    setCopiedUnit(copySavedUnit(selectedUnit))
    setNotice({
      tone: 'success',
      text: `${selectedUnit.name}을(를) 복사했습니다. 대상 슬롯을 선택한 뒤 붙여넣으세요.`,
    })
  }

  const handlePasteUnit = async () => {
    if (!copiedUnit) return
    clearError()
    const pastedUnit = copySavedUnit(copiedUnit)
    await saveUnit(pastedUnit)
    onLoadUnit(pastedUnit)
    setNotice({
      tone: 'success',
      text: `${activeSlot + 1}번 슬롯에 ${pastedUnit.name}을(를) 붙여넣었습니다.`,
    })
  }

  const handleRemoveUnit = async () => {
    if (!selectedUnit) return
    await removeUnit()
    setNotice({ tone: 'success', text: `${activeSlot + 1}번 슬롯을 비웠습니다.` })
  }

  const handleImportFile = async (file: File | undefined) => {
    if (!file) return
    clearError()
    try {
      const result = parseDeckImport(await file.text())
      if (result.decks.length === 0 && !result.unit) {
        throw new Error('가져올 덱이나 유닛이 없습니다.')
      }
      setPendingImport({ fileName: file.name, result })
      setNotice(null)
    } catch (importError) {
      setNotice({
        tone: 'error',
        text: importError instanceof Error ? importError.message : 'JSON을 가져오지 못했습니다.',
      })
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const syncCalculatorWithActiveSlot = () => {
    const state = useDeckStore.getState()
    const deck = state.decks.find((item) => item.id === state.activeDeckId)
    const unit = deck?.slots[state.activeSlot] ?? null
    if (unit) onLoadUnit(unit)
    else onClearUnit()
  }

  const handleImportDecks = async (mode: 'merge' | 'replace') => {
    if (!pendingImport) return
    await importDecks(pendingImport.result.decks, mode)
    syncCalculatorWithActiveSlot()
    setNotice({
      tone: pendingImport.result.warnings.length > 0 ? 'warning' : 'success',
      text: `${pendingImport.result.decks.length}개 덱을 ${mode === 'merge' ? '병합' : '교체'}했습니다.${formatWarnings(pendingImport.result.warnings)}`,
    })
    setPendingImport(null)
  }

  const handleImportUnitToSlot = async () => {
    const unit = pendingImport?.result.unit
    if (!unit) return
    await saveUnit(unit)
    onLoadUnit(unit)
    setNotice({
      tone: pendingImport.result.warnings.length > 0 ? 'warning' : 'success',
      text: `${activeSlot + 1}번 슬롯에 ${unit.name}을(를) 가져왔습니다.${formatWarnings(pendingImport.result.warnings)}`,
    })
    setPendingImport(null)
  }

  const handleImportUnitAsDeck = async () => {
    if (!pendingImport?.result.unit) return
    await importDecks(pendingImport.result.decks, 'merge')
    syncCalculatorWithActiveSlot()
    setNotice({
      tone: pendingImport.result.warnings.length > 0 ? 'warning' : 'success',
      text: `새 덱으로 유닛을 가져왔습니다.${formatWarnings(pendingImport.result.warnings)}`,
    })
    setPendingImport(null)
  }

  const exportJson = (kind: 'unit' | 'deck' | 'backup') => {
    if (kind !== 'unit' && !activeDeck) return
    const data =
      kind === 'unit'
        ? createUnitExport(currentSavedUnit())
        : kind === 'deck'
          ? createDeckExport(activeDeck!)
          : createBackupExport(decks)
    const label = kind === 'unit' ? 'unit' : kind === 'deck' ? 'deck' : 'backup'
    downloadJson(serializeDeckExport(data), `nova-parts-${label}-${dateStamp()}.json`)
    setNotice({ tone: 'success', text: 'JSON 파일을 만들었습니다.' })
  }

  return (
    <section className={`panel deck-panel ${className}`} aria-labelledby="deck-title">
      <div className="deck-heading">
        <div>
          <span className="micro-label">LOCAL DECK</span>
          <h2 id="deck-title">내 덱 · {activeDeck?.name ?? 'LOADING'}</h2>
        </div>
        <span>{DECK_SLOT_COUNT} UNIT SLOTS</span>
      </div>

      <div className="deck-manager" aria-label="덱 관리">
        <label className="deck-select-label">
          <span>덱 선택</span>
          <select
            aria-label="덱 선택"
            value={activeDeckId ?? ''}
            disabled={!isHydrated || isSaving}
            onChange={(event) => void selectDeck(event.target.value)}
          >
            {decks.map((deck) => (
              <option key={deck.id} value={deck.id}>{deck.name}</option>
            ))}
          </select>
        </label>
        <label className="deck-name-label">
          <span>덱 이름</span>
          <input
            aria-label="덱 이름"
            value={deckName}
            maxLength={40}
            disabled={!activeDeck || isSaving}
            onChange={(event) => setDeckName(event.target.value)}
            onBlur={() => void handleRename()}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur()
            }}
          />
        </label>
        <div className="deck-manager-actions">
          <button type="button" disabled={isSaving} onClick={() => void createDeck(`DECK ${decks.length + 1}`)}>새 덱</button>
          <button type="button" disabled={!activeDeck || isSaving} onClick={() => void duplicateDeck()}>덱 복제</button>
          <button className="is-danger" type="button" disabled={!activeDeck || isSaving} onClick={() => void handleDeleteDeck()}>삭제</button>
        </div>
      </div>

      <div className="deck-slots" aria-label="유닛 슬롯">
        {Array.from({ length: DECK_SLOT_COUNT }, (_, index) => {
          const unit = activeDeck?.slots[index] ?? null
          const weaponName = unit
            ? partsCatalogById.weapons.get(unit.partIds.weapon)?.name ?? '알 수 없는 무기'
            : null
          return (
            <button
              className={`${unit ? 'is-filled' : ''} ${activeSlot === index ? 'is-active' : ''}`}
              type="button"
              key={index}
              disabled={!activeDeck}
              onClick={() => {
                void selectSlot(index)
                if (unit) {
                  onLoadUnit(unit)
                } else {
                  onClearUnit()
                }
              }}
              aria-label={`${index + 1}번 덱 슬롯${unit ? `, ${unit.name} 저장됨` : ', 비어 있음'}`}
            >
              <span className="slot-index">{String(index + 1).padStart(2, '0')}</span>
              {unit ? (
                <>
                  <span className="mini-unit" aria-hidden="true"><i /></span>
                  <strong>{unit.name}</strong>
                  <small>{weaponName}</small>
                </>
              ) : (
                <>
                  <span className="empty-plus" aria-hidden="true">+</span>
                  <small>EMPTY</small>
                </>
              )}
            </button>
          )
        })}
      </div>

      <div className="deck-unit-editor">
        <label>
          <span>유닛 이름</span>
          <input aria-label="저장할 유닛 이름" value={unitName} maxLength={40} onChange={(event) => setUnitName(event.target.value)} />
        </label>
        {!canRegisterUnit && (
          <p className="deck-registration-warning" role="status">
            유닛 등록 불가 · {registrationIssues.join(' ')}
          </p>
        )}
        <div className="deck-unit-actions">
          <button
            className="save-unit-button"
            type="button"
            disabled={!activeDeck || isSaving || !canRegisterUnit}
            onClick={() => void handleSave()}
          >
            유닛 등록
          </button>
          <button type="button" disabled={!selectedUnit || isSaving} onClick={handleCopyUnit}>유닛 복사</button>
          <button type="button" disabled={!copiedUnit || !activeDeck || isSaving} onClick={() => void handlePasteUnit()}>유닛 붙여넣기</button>
          <button className="is-danger" type="button" disabled={!selectedUnit || isSaving} onClick={() => void handleRemoveUnit()}>슬롯 비우기</button>
        </div>
      </div>

      <div className="deck-transfer" aria-label="JSON 가져오기 및 내보내기">
        <div className="deck-transfer-actions">
          <button type="button" onClick={() => exportJson('unit')}>현재 유닛을 JSON으로 내보내기</button>
          <button type="button" disabled={!activeDeck} onClick={() => exportJson('deck')}>현재 덱을 JSON으로 내보내기</button>
          <button type="button" disabled={decks.length === 0} onClick={() => exportJson('backup')}>전체 덱을 JSON으로 내보내기</button>
        </div>
        <div className="deck-import-controls">
          <button type="button" onClick={() => fileInputRef.current?.click()}>유닛/덱 JSON 가져오기</button>
          <input
            ref={fileInputRef}
            className="sr-only"
            type="file"
            accept="application/json,.json"
            aria-label="덱 JSON 파일"
            onChange={(event) => void handleImportFile(event.target.files?.[0])}
          />
        </div>
      </div>

      {notice && (
        <div className={`deck-notice is-${notice.tone}`} role={notice.tone === 'error' ? 'alert' : 'status'}>
          <span>{notice.text}</span>
          <button type="button" aria-label="덱 알림 닫기" onClick={() => setNotice(null)}>×</button>
        </div>
      )}

      {pendingImport && (
        <div className="deck-import-dialog-backdrop" onMouseDown={() => setPendingImport(null)}>
          <section
            className="deck-import-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="deck-import-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="deck-import-dialog-header">
              <div>
                <span className="micro-label">JSON IMPORT</span>
                <h2 id="deck-import-title">가져오기 방식 선택</h2>
              </div>
              <button type="button" aria-label="가져오기 취소" onClick={() => setPendingImport(null)}>×</button>
            </div>
            <div className="deck-import-summary">
              <strong>{pendingImport.fileName}</strong>
              {pendingImport.result.data.kind === 'unit' ? (
                <p>
                  유닛 1개 · {pendingImport.result.unit?.name}
                  <br />가져올 위치를 선택하세요.
                </p>
              ) : (
                <p>
                  덱 {pendingImport.result.decks.length}개 · 유닛 {countImportedUnits(pendingImport.result.decks)}개
                  <br />기존 덱을 유지할지 전체 교체할지 선택하세요.
                </p>
              )}
              {pendingImport.result.warnings.length > 0 && (
                <ul>
                  {pendingImport.result.warnings.map((warning) => <li key={warning}>{warning}</li>)}
                </ul>
              )}
            </div>
            <div className="deck-import-options">
              {pendingImport.result.data.kind === 'unit' ? (
                <>
                  <button
                    className="is-primary"
                    type="button"
                    disabled={!activeDeck || isSaving}
                    onClick={() => void handleImportUnitToSlot()}
                  >
                    선택한 {activeSlot + 1}번 슬롯에 유닛 붙여넣기
                  </button>
                  <button type="button" disabled={isSaving} onClick={() => void handleImportUnitAsDeck()}>
                    새 덱을 만들어 유닛 가져오기
                  </button>
                </>
              ) : (
                <>
                  <button className="is-primary" type="button" disabled={isSaving} onClick={() => void handleImportDecks('merge')}>
                    기존 덱과 병합하기
                  </button>
                  <button className="is-danger" type="button" disabled={isSaving} onClick={() => void handleImportDecks('replace')}>
                    모든 덱을 가져온 내용으로 교체하기
                  </button>
                </>
              )}
              <button type="button" onClick={() => setPendingImport(null)}>취소</button>
            </div>
          </section>
        </div>
      )}
    </section>
  )
}

function downloadJson(text: string, filename: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

function dateStamp() {
  return new Date().toISOString().slice(0, 10)
}

function countImportedUnits(decks: ImportResult['decks']) {
  return decks.reduce(
    (count, deck) => count + deck.slots.filter((unit) => unit !== null).length,
    0,
  )
}

function formatWarnings(warnings: string[]) {
  return warnings.length > 0 ? ` ${warnings.join(' ')}` : ''
}
