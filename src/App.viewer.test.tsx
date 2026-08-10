// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useEffect } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ViewerCameraState } from './viewer/camera-state.ts'
import type { ViewerDisplayState } from './viewer/StandalonePartViewer.tsx'

interface MockViewerProps {
  onStateChange?(state: ViewerDisplayState): void
  onCameraStateChange?(state: ViewerCameraState): void
  onInteractionStart?(): void
}

vi.mock('./viewer/AssembledUnitViewer.tsx', () => ({
  AssembledUnitViewer: function MockAssembledUnitViewer(props: MockViewerProps) {
    const { onStateChange, onCameraStateChange } = props
    useEffect(() => {
      onStateChange?.({
        status: 'ready',
        message: '프리뷰 준비 완료',
        cacheStatus: 'hit',
      })
      onCameraStateChange?.({
        azimuthDegrees: -42,
        polarDegrees: 73,
        zoom: 1.75,
      })
    }, [onCameraStateChange, onStateChange])

    return (
      <>
        <button type="button" onClick={props.onInteractionStart}>
          테스트 프리뷰 조작
        </button>
        <button type="button" onClick={() => {
          for (let angle = 0; angle < 250; angle += 1) {
            onCameraStateChange?.({
              azimuthDegrees: angle,
              polarDegrees: 60,
              zoom: 2,
            })
          }
        }}>
          카메라 이벤트 연속 발생
        </button>
      </>
    )
  },
}))

import App from './App.tsx'
import { USER_GUIDE_STORAGE_KEY } from './ui/ServiceNotice.tsx'

beforeEach(() => {
  window.localStorage.setItem(USER_GUIDE_STORAGE_KEY, 'seen')
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  window.localStorage.clear()
})

describe('3D 프리뷰 HUD', () => {
  it('캐시·카메라 상태를 표시하고 프리뷰 조작 시 안내를 숨긴다', async () => {
    render(<App />)

    expect(await screen.findByText('CACHE LOADED')).toBeVisible()
    expect(screen.getByText(/ROTATE H -42° · V 73°/)).toBeVisible()
    expect(screen.getByText('ZOOM 1.75×')).toBeVisible()
    expect(screen.getByText('프리뷰 조작')).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: '테스트 프리뷰 조작' }))
    await waitFor(() => {
      expect(screen.queryByText('프리뷰 조작')).not.toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: '카메라 이벤트 연속 발생' }))
    expect(await screen.findByText(/ROTATE H \+249° · V 60°/)).toBeVisible()
    expect(screen.getByText('ZOOM 2.00×')).toBeVisible()

    fireEvent.click(within(screen.getByLabelText('중앙 화면 방식')).getByRole(
      'button',
      { name: '시뮬레이션' },
    ))
    expect(screen.getByRole('heading', { name: '전투 시뮬레이션' })).toBeVisible()
  })
})
