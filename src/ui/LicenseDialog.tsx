import { useEffect, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'

import './LicenseDialog.css'
import { useModalDialog } from './useModalDialog.ts'

interface LicenseDialogProps {
  open: boolean
  onClose(): void
  restoreFocusRef: RefObject<HTMLButtonElement | null>
}

const LICENSES_URL = '/THIRD_PARTY_LICENSES.txt'

export function LicenseDialog({
  open,
  onClose,
  restoreFocusRef,
}: LicenseDialogProps) {
  const dialogRef = useRef<HTMLElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const [licenseText, setLicenseText] = useState<string | null>(null)
  const [loadError, setLoadError] = useState(false)

  useModalDialog({
    dialogRef,
    initialFocusRef: closeRef,
    restoreFocusRef,
    open,
    onClose,
  })

  useEffect(() => {
    if (!open || licenseText !== null) return

    const controller = new AbortController()
    setLoadError(false)

    void fetch(LICENSES_URL, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`라이선스 문서를 불러오지 못했습니다 (${response.status})`)
        }
        return response.text()
      })
      .then(setLicenseText)
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setLoadError(true)
      })

    return () => controller.abort()
  }, [licenseText, open])

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

        <div className="license-dialog-content">
          {licenseText !== null ? (
            <pre tabIndex={0}>{licenseText}</pre>
          ) : loadError ? (
            <div className="license-dialog-state" role="alert">
              <strong>라이선스 문서를 불러오지 못했습니다.</strong>
              <p>잠시 후 다시 시도하거나 원문 텍스트 파일을 열어 주세요.</p>
              <a href={LICENSES_URL} target="_blank" rel="noreferrer">
                라이선스 텍스트 파일 열기
              </a>
            </div>
          ) : (
            <div className="license-dialog-state" role="status">
              라이선스 문서를 불러오는 중입니다.
            </div>
          )}
        </div>
      </article>
    </div>,
    document.body,
  )
}
