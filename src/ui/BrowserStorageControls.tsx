import { useState } from 'react'

import { clearBrowserStorage } from '../data/browser-storage.ts'

type ClearStatus = 'idle' | 'clearing' | 'cleared' | 'error'

export interface BrowserStorageControlsProps {
  readonly clearStorage?: () => Promise<void>
  readonly reload?: () => void
}

export function BrowserStorageControls({
  clearStorage = clearBrowserStorage,
  reload = () => window.location.reload(),
}: BrowserStorageControlsProps) {
  const [status, setStatus] = useState<ClearStatus>('idle')

  const handleClear = async () => {
    const confirmed = window.confirm(
      '저장된 모든 덱, 마지막 선택 상태와 3D 리소스 캐시를 삭제할까요? '
      + '이 작업은 되돌릴 수 없으며, 필요한 덱은 먼저 JSON으로 내보내야 합니다.',
    )
    if (!confirmed) return

    setStatus('clearing')
    try {
      await clearStorage()
    } catch {
      setStatus('error')
      return
    }

    setStatus('cleared')
    reload()
  }

  return (
    <div className="browser-storage-controls">
      <button
        className="app-settings-action is-danger"
        type="button"
        disabled={status === 'clearing'}
        onClick={() => void handleClear()}
      >
        {status === 'clearing' ? '저장 정보 삭제 중…' : '브라우저 저장 정보 모두 삭제'}
      </button>
      {status === 'error' && (
        <small className="browser-storage-status is-error" role="alert">
          일부 정보를 삭제하지 못했습니다. 브라우저의 사이트 데이터 설정을 확인한 뒤 다시 시도해 주세요.
        </small>
      )}
      {status === 'cleared' && (
        <small className="browser-storage-status" role="status">
          저장 정보를 삭제했습니다. 앱을 새로고침합니다.
        </small>
      )}
    </div>
  )
}
