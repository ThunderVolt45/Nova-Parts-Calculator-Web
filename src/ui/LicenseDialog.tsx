import { useEffect, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'

import './LicenseDialog.css'
import { useModalDialog } from './useModalDialog.ts'

interface LicenseDialogProps {
  open: boolean
  onClose(): void
  restoreFocusRef: RefObject<HTMLButtonElement | null>
}

const PROJECT_REPOSITORY_URL =
  'https://github.com/ThunderVolt45/Nova-Parts-Calculator-Web'

const licenseDocuments = {
  project: {
    label: '프로젝트 라이선스',
    url: '/LICENSE.txt',
  },
  thirdParty: {
    label: '기준 프로젝트·제3자 라이선스',
    url: '/THIRD_PARTY_LICENSES.txt',
  },
} as const

type LicenseDocumentKey = keyof typeof licenseDocuments

export function LicenseDialog({
  open,
  onClose,
  restoreFocusRef,
}: LicenseDialogProps) {
  const dialogRef = useRef<HTMLElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const [activeDocument, setActiveDocument] =
    useState<LicenseDocumentKey>('project')
  const [documentTexts, setDocumentTexts] = useState<
    Partial<Record<LicenseDocumentKey, string>>
  >({})
  const [loadingDocument, setLoadingDocument] =
    useState<LicenseDocumentKey | null>(null)
  const [failedDocuments, setFailedDocuments] = useState<
    Partial<Record<LicenseDocumentKey, boolean>>
  >({})

  useModalDialog({
    dialogRef,
    initialFocusRef: closeRef,
    restoreFocusRef,
    open,
    onClose,
  })

  useEffect(() => {
    if (!open || documentTexts[activeDocument] !== undefined) return

    const controller = new AbortController()
    const documentKey = activeDocument
    const documentUrl = licenseDocuments[documentKey].url
    setLoadingDocument(documentKey)
    setFailedDocuments((current) => ({ ...current, [documentKey]: false }))

    void fetch(documentUrl, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`라이선스 문서를 불러오지 못했습니다 (${response.status})`)
        }
        return response.text()
      })
      .then((text) => {
        setDocumentTexts((current) => ({ ...current, [documentKey]: text }))
        setLoadingDocument((current) => current === documentKey ? null : current)
      })
      .catch((error: unknown) => {
        setLoadingDocument((current) => current === documentKey ? null : current)
        if (error instanceof DOMException && error.name === 'AbortError') return
        setFailedDocuments((current) => ({ ...current, [documentKey]: true }))
      })

    return () => controller.abort()
  }, [activeDocument, documentTexts, open])

  if (!open) return null

  return createPortal(
    <div
      className="license-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <article
        ref={dialogRef}
        className="license-dialog"
        role="dialog"
        tabIndex={-1}
        aria-modal="true"
        aria-labelledby="license-dialog-title"
        aria-describedby="license-dialog-summary"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="license-dialog-header">
          <div>
            <span className="micro-label">OPEN SOURCE NOTICES</span>
            <h2 id="license-dialog-title">오픈소스 및 제3자 라이선스</h2>
            <p id="license-dialog-summary">
              프로젝트, 기준 구현과 사용한 프레임워크·패키지의 라이선스 전문입니다.
            </p>
            <a
              className="license-dialog-repository"
              href={PROJECT_REPOSITORY_URL}
              target="_blank"
              rel="noreferrer"
            >
              웹 앱 GitHub 저장소
            </a>
          </div>
          <button
            ref={closeRef}
            className="license-dialog-close"
            type="button"
            aria-label="라이선스 전문 닫기"
            onClick={onClose}
          >
            <span aria-hidden="true" />
          </button>
        </header>

        <nav className="license-dialog-tabs" aria-label="라이선스 문서 선택">
          {Object.entries(licenseDocuments).map(([key, document]) => (
            <button
              key={key}
              type="button"
              aria-pressed={activeDocument === key}
              onClick={() => setActiveDocument(key as LicenseDocumentKey)}
            >
              {document.label}
            </button>
          ))}
        </nav>

        <div
          className="license-dialog-content"
          aria-label={licenseDocuments[activeDocument].label}
        >
          {documentTexts[activeDocument] !== undefined ? (
            <pre tabIndex={0}>{documentTexts[activeDocument]}</pre>
          ) : failedDocuments[activeDocument] ? (
            <div className="license-dialog-state" role="alert">
              <strong>라이선스 문서를 불러오지 못했습니다.</strong>
              <p>잠시 후 다시 시도하거나 원문 텍스트 파일을 열어 주세요.</p>
              <a
                href={licenseDocuments[activeDocument].url}
                target="_blank"
                rel="noreferrer"
              >
                라이선스 텍스트 파일 열기
              </a>
            </div>
          ) : (
            <div className="license-dialog-state" role="status">
              {loadingDocument === activeDocument
                ? '라이선스 문서를 불러오는 중입니다.'
                : '라이선스 문서를 준비하고 있습니다.'}
            </div>
          )}
        </div>
      </article>
    </div>,
    document.body,
  )
}
