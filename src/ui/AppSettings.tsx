import { useRef, useState } from 'react'

import { BrowserStorageControls } from './BrowserStorageControls.tsx'
import { LicenseDialog } from './LicenseDialog.tsx'

interface AppSettingsProps {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
}

export function AppSettings({ open, onOpenChange }: AppSettingsProps) {
  const [licensesOpen, setLicensesOpen] = useState(false)
  const licensesTriggerRef = useRef<HTMLButtonElement>(null)

  return (
    <>
      <details
        className="app-settings"
        open={open}
        onToggle={(event) => onOpenChange(event.currentTarget.open)}
      >
        <summary>설정</summary>
        <article className="app-settings-card" aria-labelledby="app-settings-title">
          <header>
            <span className="micro-label">LOCAL APP SETTINGS</span>
            <h2 id="app-settings-title">설정</h2>
            <p>이 브라우저에 저장된 정보와 오픈소스 고지를 관리합니다.</p>
          </header>

          <section>
            <h3>라이선스</h3>
            <p>프로젝트, 기준 구현과 사용한 오픈소스 패키지의 라이선스를 확인합니다.</p>
            <button
              ref={licensesTriggerRef}
              className="app-settings-action"
              type="button"
              aria-haspopup="dialog"
              onClick={() => setLicensesOpen(true)}
            >
              라이선스 전문 보기
            </button>
          </section>

          <section>
            <h3>브라우저 저장 정보</h3>
            <p>
              저장된 덱, 마지막 선택 상태, 3D 리소스 캐시와 가이드 확인 상태를
              모두 삭제합니다. 원본 게임 파일과 내보낸 JSON은 변경하지 않습니다.
            </p>
            <BrowserStorageControls />
          </section>
        </article>
      </details>
      <LicenseDialog
        open={licensesOpen}
        onClose={() => setLicensesOpen(false)}
        restoreFocusRef={licensesTriggerRef}
      />
    </>
  )
}
