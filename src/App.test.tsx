// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'

import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import App from './App.tsx'
import { partsCatalog } from './data/catalog/catalog.ts'
import {
  createBackupExport,
  createUnitExport,
  serializeDeckExport,
} from './deck/transfer.ts'
import { useDeckStore } from './deck/store.ts'
import { createDeck, type SavedUnit } from './domain/deck/schema.ts'
import { getViewerResourceLabel } from './viewer/viewer-hud.ts'
import { USER_GUIDE_STORAGE_KEY } from './ui/ServiceNotice.tsx'

function createImportUnit(): SavedUnit {
  const body = partsCatalog.parts.bodies.find((part) => part.id !== 0)!
  const weapon = partsCatalog.parts.weapons.find(
    (part) => part.id !== 0 && part.mountType === body.mountType,
  )!
  const leg = partsCatalog.parts.legs.find(
    (part) => part.id !== 0 && part.loadCapacity >= body.weight + weapon.weight,
  )!

  return {
    name: '가져오기 테스트',
    schemaVersion: 1,
    catalogVersion: partsCatalog.catalogVersion,
    partIds: { leg: leg.id, body: body.id, weapon: weapon.id, accessory: 0 },
    subcoreIds: { leg: 0, body: 0, weapon: 0 },
    reinforcement: {
      leg: { watt: 0, health: 0, damage: 0 },
      body: { watt: 0, health: 0, damage: 0 },
      weapon: { watt: 0, health: 0, damage: 0 },
    },
    accessoryRandomOptions: { health: 0, damage: 0, armor: 0 },
  }
}

function createJsonFile(name: string, contents: string) {
  const file = new File([contents], name, { type: 'application/json' })
  Object.defineProperty(file, 'text', { value: async () => contents })
  return file
}

async function selectPart(
  user: ReturnType<typeof userEvent.setup>,
  slot: '다리' | '몸통' | '무기',
  partName: string,
) {
  await user.click(screen.getByRole('button', { name: new RegExp(`^${slot} 부품 변경`) }))
  const dialog = screen.getByRole('dialog', { name: `${slot} 선택` })
  await user.click(within(dialog).getByRole('button', { name: partName }))
  await user.click(within(dialog).getByRole('button', { name: `${partName} 사용` }))
}

async function selectValidAssembly(user: ReturnType<typeof userEvent.setup>) {
  await selectPart(user, '다리', '토들러')
  await selectPart(user, '몸통', '코포럴')
  await selectPart(user, '무기', '데미시즈')
}

beforeEach(() => {
  window.localStorage.setItem(USER_GUIDE_STORAGE_KEY, 'seen')
})

afterEach(() => {
  cleanup()
  window.localStorage.clear()
  vi.unstubAllGlobals()
})

describe('3D 프리뷰 리소스 상태 표시', () => {
  it('GX 연결, 캐시 로드, 오프라인 상태를 구분한다', () => {
    expect(getViewerResourceLabel(128, { status: 'ready', message: '' }))
      .toBe('128 FILES LOADED')
    expect(getViewerResourceLabel(null, {
      status: 'ready',
      message: '프리뷰 준비 완료',
      cacheStatus: 'hit',
    })).toBe('CACHE LOADED')
    expect(getViewerResourceLabel(null, { status: 'offline', message: '' }))
      .toBe('GX OFFLINE')
  })
})

describe('공개 서비스 고지', () => {
  it('첫 방문에는 퀵 가이드를 자동으로 열고 닫은 뒤 다시 표시하지 않는다', async () => {
    window.localStorage.removeItem(USER_GUIDE_STORAGE_KEY)
    const user = userEvent.setup()
    const firstVisit = render(<App />)

    const dialog = await screen.findByRole('dialog', {
      name: 'Nova Assembly 사용 가이드',
    })
    expect(dialog).toBeVisible()
    expect(within(dialog).getByText(
      '조립부터 덱 백업과 3D 프리뷰까지, 필요한 기능을 한 화면에서 확인하세요.',
    )).toBeVisible()
    expect(within(dialog).getByRole('button', {
      name: '전체 기능 자세히 보기',
    })).toBeVisible()

    await user.click(within(dialog).getByRole('button', {
      name: '가이드 닫고 조립 시작',
    }))
    expect(dialog).not.toBeInTheDocument()
    expect(window.localStorage.getItem(USER_GUIDE_STORAGE_KEY)).toBe('seen')

    firstVisit.unmount()
    render(<App />)
    await waitFor(() => {
      expect(screen.queryByRole('dialog', {
        name: 'Nova Assembly 사용 가이드',
      })).not.toBeInTheDocument()
    })
  })

  it('앱 안에서 이미지 사용자 가이드를 열고 닫는다', async () => {
    const user = userEvent.setup()
    render(<App />)

    const trigger = screen.getByRole('button', { name: '사용 가이드' })
    expect(screen.queryByRole('dialog', { name: 'Nova Assembly 사용 가이드' }))
      .not.toBeInTheDocument()

    await user.click(trigger)

    const dialog = screen.getByRole('dialog', {
      name: 'Nova Assembly 사용 가이드',
    })
    expect(dialog).toBeVisible()
    expect(
      within(dialog).getByRole('heading', {
        name: '처음이라면 이 순서로 시작하세요',
      }),
    ).toBeVisible()
    expect(within(dialog).getAllByRole('img')).toHaveLength(3)
    expect(
      within(dialog).getByRole('button', { name: '사용 가이드 닫기' })
        .querySelector('.user-guide-close-icon'),
    ).toBeInTheDocument()
    expect(
      within(dialog).getByRole('img', {
        name: /Nova Assembly 데스크톱 화면/,
      }),
    ).toHaveAttribute('src', '/guide/overview-hd.jpg')

    await user.keyboard('{Escape}')
    expect(dialog).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('버그와 권리 침해 신고를 분리하고 서비스 정책을 안내한다', async () => {
    const user = userEvent.setup()
    render(<App />)

    expect(screen.queryByText('비공식 팬 도구')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: '버그 신고' })).toHaveAttribute(
      'href',
      'https://github.com/ThunderVolt45/Nova-Parts-Calculator-Web/issues/new?template=bug_report.yml',
    )
    await user.click(screen.getByText('서비스 안내'))

    expect(
      screen.getByRole('heading', { name: '서비스 및 개인정보 안내' }),
    ).toBeVisible()
    expect(screen.getByText(/게임 개발사·운영사와 제휴하거나/)).toBeVisible()
    expect(screen.getByText(/앱 서버로 전송하지 않습니다/)).toBeVisible()
    expect(screen.getByText(/Cloudflare가 IP 주소/)).toBeVisible()
    expect(screen.getByText(/ThunderVolt45와 cam900의 저작권/)).toBeVisible()
    vi.stubGlobal('fetch', vi.fn().mockImplementation((input: string) =>
      Promise.resolve({
        ok: true,
        text: async () => input === '/LICENSE.txt'
          ? 'MIT License\n\nCopyright (c) 2026 ThunderVolt45'
          : [
              'REFERENCE PROJECT NOTICES',
              'Nova Parts Calculator (Python)',
              'Contributors: ThunderVolt45, cam900',
              'React@19.2.4 — MIT',
            ].join('\n'),
      }),
    ))
    const licensesTrigger = screen.getByRole('button', {
      name: '페이지에서 라이선스 전문 보기',
    })
    await user.click(licensesTrigger)

    const licensesDialog = await screen.findByRole('dialog', {
      name: '오픈소스 및 제3자 라이선스',
    })
    expect(within(licensesDialog).getByText(/Copyright \(c\) 2026/)).toBeVisible()

    await user.click(within(licensesDialog).getByRole('button', {
      name: '기준 프로젝트·제3자 라이선스',
    }))
    expect(within(licensesDialog).getByText(/Nova Parts Calculator/)).toBeVisible()
    expect(within(licensesDialog).getByText(/ThunderVolt45, cam900/)).toBeVisible()

    await user.keyboard('{Escape}')
    expect(licensesDialog).not.toBeInTheDocument()
    expect(licensesTrigger).toHaveFocus()
    const rightsReportUrl = new URL(
      screen
        .getByRole('link', { name: '권리 침해 신고 이메일 작성' })
        .getAttribute('href')!,
    )
    expect(rightsReportUrl.protocol).toBe('mailto:')
    expect(rightsReportUrl.pathname).toBe('contactvolt45@gmail.com')
    expect(rightsReportUrl.searchParams.get('subject')).toBe(
      '[Nova Assembly] 권리 침해 신고',
    )
    expect(rightsReportUrl.searchParams.get('body')).toContain(
      '권리 침해가 의심되는 서비스 URL 또는 화면:',
    )
  })
})

describe('T09 부품 선택 및 강화 UI', () => {
  it('부품을 이름으로 검색하고 상세 확인 후 적용한다', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: /다리 부품 변경/ }))
    const dialog = screen.getByRole('dialog', { name: '다리 선택' })
    const search = within(dialog).getByRole('searchbox', { name: '다리 부품 검색' })

    await user.type(search, '로드런너')
    const resultCard = within(dialog).getByRole('button', { name: '로드런너' })
    expect(resultCard.querySelector('.catalog-result-thumbnail')).toBeInTheDocument()
    expect(within(resultCard).getByText('와트 60')).toHaveClass('is-watt')
    expect(within(resultCard).getByText('체력 0')).toHaveClass('is-health')
    expect(within(resultCard).getByText('공격력 0')).toHaveClass('is-damage')
    expect(resultCard).not.toHaveTextContent('W 60')
    expect(resultCard.querySelector('.catalog-result-specs')).toHaveTextContent('하중 50')
    expect(resultCard.querySelector('.catalog-result-specs')).toHaveTextContent('속도 +100')

    await user.click(resultCard)
    expect(within(dialog).getByRole('heading', { name: '로드런너' })).toBeVisible()
    const detailPreview = dialog.querySelector('.catalog-detail-preview')
    expect(detailPreview?.querySelector('.standalone-viewer')).toBeInTheDocument()
    expect(detailPreview?.querySelector('.catalog-detail-model')).not.toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: '로드런너 사용' }))
    expect(screen.queryByRole('dialog', { name: '다리 선택' })).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: '다리 부품 변경, 현재 로드런너' }),
    ).toBeVisible()
  })

  it('랜덤 옵션 액세서리를 선택하면 세 옵션 입력을 계산 상태에 연결한다', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: /액세서리 부품 변경/ }))
    const dialog = screen.getByRole('dialog', { name: '액세서리 선택' })
    await user.type(
      within(dialog).getByRole('searchbox', { name: '액세서리 부품 검색' }),
      'P쥬얼',
    )
    await user.click(within(dialog).getByRole('button', { name: 'P쥬얼' }))
    await user.click(within(dialog).getByRole('button', { name: 'P쥬얼 사용' }))

    const healthOption = screen.getByRole('spinbutton', {
      name: '액세서리 체력 랜덤 옵션',
    })
    await user.clear(healthOption)
    await user.type(healthOption, '200')

    expect(healthOption).toHaveValue(200)
    expect(
      screen.getByRole('spinbutton', { name: '액세서리 공격 랜덤 옵션' }),
    ).toHaveAttribute('max', '20')
    expect(
      screen.getByRole('spinbutton', { name: '액세서리 방어 랜덤 옵션' }),
    ).toHaveAttribute('max', '10')
  })

  it('서브코어를 아이콘 목록에서 선택해 부품 카드에 반영한다', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: /다리 서브코어 변경/ }))
    const dialog = screen.getByRole('dialog', { name: '다리 서브코어 선택' })
    expect(
      within(dialog).getByRole('button', { name: /^에어리움,/ }),
    ).toHaveTextContent('Ar')
    const subcoreButton = within(dialog).getByRole('button', { name: /^레오늄,/ })
    expect(subcoreButton.querySelector('.subcore-card-tags')).toHaveTextContent(/\S/)
    expect(within(dialog).queryByText('SUB CORE DETAIL')).not.toBeInTheDocument()
    await user.click(subcoreButton)

    expect(screen.queryByRole('dialog', { name: '다리 서브코어 선택' })).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: '다리 서브코어 변경, 현재 레오늄' }),
    ).toBeVisible()
  })

  it('빈 부품은 모든 타입 필터에서 부품 없음으로 제공하고 ID를 노출하지 않는다', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: /몸통 부품 변경/ }))
    const dialog = screen.getByRole('dialog', { name: '몸통 선택' })

    expect(within(dialog).queryByRole('button', { name: '일반형' })).not.toBeInTheDocument()
    expect(within(dialog).getByPlaceholderText('부품 이름 검색')).toBeVisible()
    expect(within(dialog).queryByText(/ID 0/)).not.toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: '팔형' }))
    expect(within(dialog).getByRole('button', { name: /^부품 없음/ })).toBeVisible()

    await user.click(within(dialog).getByRole('button', { name: '어깨형' }))
    expect(within(dialog).getByRole('button', { name: /^부품 없음/ })).toBeVisible()
  })

  it('서브코어 선택 화면은 이름으로만 검색하고 ID를 표시하지 않는다', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: /무기 서브코어 변경/ }))
    const dialog = screen.getByRole('dialog', { name: '무기 서브코어 선택' })

    expect(within(dialog).getByPlaceholderText('서브코어 이름 검색')).toBeVisible()
    expect(within(dialog).queryByText(/ID 0/)).not.toBeInTheDocument()
  })

  it('다리 선택에서 지상과 공중 부품을 구분해 필터링한다', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: /다리 부품 변경/ }))
    const dialog = screen.getByRole('dialog', { name: '다리 선택' })

    await user.click(within(dialog).getByRole('button', { name: '공중' }))
    expect(within(dialog).getByRole('button', { name: '패트롤' })).toBeVisible()
    expect(within(dialog).getByRole('button', { name: '스타쉽' })).toBeVisible()
    expect(within(dialog).queryByRole('button', { name: '로드런너' })).not.toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: /^부품 없음/ })).toBeVisible()

    await user.click(within(dialog).getByRole('button', { name: '지상' }))
    expect(within(dialog).getByRole('button', { name: '로드런너' })).toBeVisible()
    expect(within(dialog).queryByRole('button', { name: '패트롤' })).not.toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: /^부품 없음/ })).toBeVisible()
  })
})

describe('T10 계산 결과 및 시뮬레이션 UI', () => {
  it('중앙은 조립 유닛 전용이고 각 부품 카드가 개별 프리뷰 공간을 제공한다', () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: '조립 유닛 프리뷰' })).toBeVisible()
    expect(screen.getByRole('button', { name: '유닛 프리뷰' })).toBeVisible()
    expect(screen.queryByRole('button', { name: '조립 3D' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '부품 3D' })).not.toBeInTheDocument()
    for (const slot of ['다리', '몸통', '무기', '액세서리']) {
      const preview = screen.getByRole('button', { name: `${slot} 프리뷰 선택` })
      expect(preview.querySelector('.model-thumbnail-empty')).toBeInTheDocument()
      expect(preview.querySelector('.part-model')).not.toBeInTheDocument()
    }
    const bodyPreview = screen.getByRole('button', { name: '몸통 프리뷰 선택' })
    expect(bodyPreview.querySelector('.mount-sprite')).toBeNull()
    expect(screen.getByRole('button', { name: '애니메이션 재생' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '처음부터' })).toBeDisabled()
    for (const clip of ['Idle', 'Move', 'Attack']) {
      expect(screen.getByRole('button', { name: clip })).toBeDisabled()
    }
  })

  it('조립 초기화 시 모든 부품과 강화 수치를 비운다', async () => {
    const user = userEvent.setup()
    render(<App />)
    await selectValidAssembly(user)

    const legCard = document.querySelectorAll<HTMLElement>('.part-selector')[0]!
    await user.click(legCard.querySelector<HTMLButtonElement>('.part-card-stat-watt')!)
    const wattInput = screen.getByRole('spinbutton', { name: '와트 강화 수치' })
    await user.clear(wattInput)
    await user.type(wattInput, '57')

    await user.click(screen.getByRole('button', { name: '초기화' }))

    for (const slot of ['다리', '몸통', '무기', '액세서리']) {
      expect(screen.getByRole('button', {
        name: `${slot} 부품 변경, 현재 부품 없음`,
      })).toBeVisible()
    }

    const reinforcementKeys = [
      ['watt', '와트'],
      ['health', '체력'],
      ['damage', '공격'],
    ] as const
    const partCards = document.querySelectorAll<HTMLElement>('.part-selector')
    for (const partCard of Array.from(partCards).slice(0, 3)) {
      for (const [key, label] of reinforcementKeys) {
        await user.click(
          partCard.querySelector<HTMLButtonElement>(`.part-card-stat-${key}`)!,
        )
        expect(screen.getByRole('spinbutton', {
          name: `${label} 강화 수치`,
        })).toHaveValue(0)
      }
    }
  })

  it('기본과 최종 능력치를 구분하고 적용 조건을 초기화한다', async () => {
    const user = userEvent.setup()
    render(<App />)
    await selectValidAssembly(user)

    expect(screen.getByLabelText('기본 능력치')).toHaveTextContent('BASE')

    const centerMode = screen.getByLabelText('중앙 화면 방식')
    await user.click(within(centerMode).getByRole('button', { name: '시뮬레이션' }))

    expect(screen.getByLabelText('시뮬레이션 최종 능력치')).toHaveTextContent('FINAL')
    const resetButton = screen.getByRole('button', { name: '조건 초기화' })
    expect(resetButton).toBeDisabled()
    expect(screen.getByText('적용 조건 없음')).toBeVisible()

    const attackBase = screen.getByRole('checkbox', { name: '공격 기본' })
    await user.click(attackBase)

    expect(screen.getByText('1개 적용 중')).toBeVisible()
    expect(resetButton).toBeEnabled()
    expect(document.querySelector('.simulation-additive')).toBeInTheDocument()

    await user.click(resetButton)
    expect(attackBase).not.toBeChecked()
    expect(screen.getByText('적용 조건 없음')).toBeVisible()
    expect(document.querySelector('.simulation-additive')).not.toBeInTheDocument()
  })

  it('조립 불가 원인과 문제가 있는 부품을 함께 표시한다', async () => {
    const user = userEvent.setup()
    render(<App />)
    await selectValidAssembly(user)

    await user.click(screen.getByRole('button', { name: /몸통 부품 변경/ }))
    const dialog = screen.getByRole('dialog', { name: '몸통 선택' })
    await user.click(within(dialog).getByRole('button', { name: '부품 없음' }))
    await user.click(within(dialog).getByRole('button', { name: '부품 없음 사용' }))

    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('몸통 부품이 없습니다.')
    const bodyTrigger = screen.getByRole('button', {
      name: '몸통 부품 변경, 현재 부품 없음',
    })
    expect(bodyTrigger.closest('.part-selector')).toHaveAttribute('aria-invalid', 'true')
  })

  it('선택한 부품의 특수 능력을 결과 패널에 표시한다', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: /다리 부품 변경/ }))
    const dialog = screen.getByRole('dialog', { name: '다리 선택' })
    await user.type(
      within(dialog).getByRole('searchbox', { name: '다리 부품 검색' }),
      '크루저N',
    )
    await user.click(within(dialog).getByRole('button', { name: '크루저N' }))
    await user.click(within(dialog).getByRole('button', { name: '크루저N 사용' }))

    expect(screen.getByText('패시브 · 다리')).toBeVisible()
    expect(screen.getByText(/이동 속도 감소 효과/)).toBeVisible()

    const floatMode = screen.getByRole('checkbox', { name: '실수 계산' })
    await user.click(floatMode)
    expect(floatMode).toBeChecked()

    await user.click(screen.getByRole('button', { name: '초기화' }))
    expect(floatMode).not.toBeChecked()
    expect(
      screen.queryByRole('button', { name: '다리 부품 변경, 현재 크루저N' }),
    ).not.toBeInTheDocument()
  })
})

describe('T11-T12 덱 저장 및 편집 UI', () => {
  it('페이지 진입 시 마지막 선택 대신 첫 번째 덱의 1번 유닛을 불러온다', async () => {
    const previousDeckState = useDeckStore.getState()
    const firstUnit = { ...createImportUnit(), name: 'FIRST UNIT' }
    const firstDeck = createDeck('FIRST DECK', partsCatalog.catalogVersion, {
      id: 'first-deck',
      now: '2026-01-01T00:00:00.000Z',
    })
    firstDeck.slots[0] = firstUnit
    const secondDeck = createDeck('SECOND DECK', partsCatalog.catalogVersion, {
      id: 'second-deck',
      now: '2026-01-02T00:00:00.000Z',
    })
    useDeckStore.setState({
      decks: [firstDeck, secondDeck],
      activeDeckId: secondDeck.id,
      activeSlot: 4,
      isHydrated: true,
      isSaving: false,
      error: null,
    })

    const { unmount } = render(<App />)

    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: '덱 선택' })).toHaveValue(firstDeck.id)
      expect(screen.getByRole('button', {
        name: '1번 덱 슬롯, FIRST UNIT 저장됨',
      })).toHaveClass('is-active')
    })
    const legName = partsCatalog.parts.legs.find(
      (part) => part.id === firstUnit.partIds.leg,
    )!.name
    expect(screen.getByRole('button', {
      name: `다리 부품 변경, 현재 ${legName}`,
    })).toBeVisible()

    unmount()
    useDeckStore.setState(previousDeckState)
  })

  it('저장 슬롯은 자동으로 불러오고 빈 슬롯은 계산기를 초기화한다', async () => {
    const user = userEvent.setup()
    render(<App />)

    await screen.findByRole('combobox', { name: '덱 선택' })
    await selectValidAssembly(user)
    await user.click(screen.getByRole('button', { name: '유닛 등록' }))

    await waitFor(() => {
      const slot = screen.getByRole('button', { name: '1번 덱 슬롯, UNIT-01 저장됨' })
      expect(slot).toBeVisible()
      expect(slot.querySelector('.deck-unit-thumbnail')).toBeInTheDocument()
      expect(slot.querySelector('.mini-unit')).not.toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: '유닛 복사' }))
    await user.click(screen.getByRole('button', { name: '2번 덱 슬롯, 비어 있음' }))
    await user.click(screen.getByRole('button', { name: '유닛 붙여넣기' }))
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: '2번 덱 슬롯, UNIT-01 저장됨' }),
      ).toBeVisible()
    })

    await user.click(screen.getByRole('button', { name: /무기 부품 변경/ }))
    const dialog = screen.getByRole('dialog', { name: '무기 선택' })
    await user.click(within(dialog).getByRole('button', { name: '부품 없음' }))
    await user.click(within(dialog).getByRole('button', { name: '부품 없음 사용' }))
    expect(
      screen.getByRole('button', { name: '무기 부품 변경, 현재 부품 없음' }),
    ).toBeVisible()

    await user.click(
      screen.getByRole('button', { name: '1번 덱 슬롯, UNIT-01 저장됨' }),
    )
    expect(
      screen.queryByRole('button', { name: '무기 부품 변경, 현재 부품 없음' }),
    ).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '3번 덱 슬롯, 비어 있음' }))
    expect(
      screen.getByRole('button', { name: '다리 부품 변경, 현재 부품 없음' }),
    ).toBeVisible()
    expect(
      screen.getByRole('button', { name: '몸통 부품 변경, 현재 부품 없음' }),
    ).toBeVisible()
    expect(
      screen.getByRole('button', { name: '무기 부품 변경, 현재 부품 없음' }),
    ).toBeVisible()

    const wattStats = document.querySelectorAll<HTMLButtonElement>(
      '.part-card-stat-watt',
    )
    expect(wattStats).toHaveLength(4)
    await user.click(wattStats[0])
    expect(screen.getByRole('spinbutton', { name: '와트 강화 수치' })).toHaveValue(0)
    expect(screen.getByRole('button', { name: '유닛 등록' })).toBeDisabled()
    expect(screen.getByText(/유닛 등록 불가/)).toBeVisible()

    expect(
      screen.getByRole('button', { name: '현재 유닛을 JSON으로 내보내기' }),
    ).toBeVisible()
    expect(
      screen.getByRole('button', { name: '현재 덱을 JSON으로 내보내기' }),
    ).toBeVisible()
    expect(
      screen.getByRole('button', { name: '전체 덱을 JSON으로 내보내기' }),
    ).toBeVisible()
    expect(
      screen.getByRole('button', { name: '유닛/덱 JSON 가져오기' }),
    ).toBeVisible()
    expect(screen.queryByRole('combobox', { name: '가져오기 방식' })).not.toBeInTheDocument()
  })

  it('새 덱을 만들고 이름을 변경한다', async () => {
    const user = userEvent.setup()
    render(<App />)

    const deckSelect = await screen.findByRole('combobox', { name: '덱 선택' })
    const initialCount = within(deckSelect).getAllByRole('option').length
    await user.click(screen.getByRole('button', { name: '새 덱' }))

    await waitFor(() => {
      expect(within(deckSelect).getAllByRole('option')).toHaveLength(initialCount + 1)
    })

    const nameInput = screen.getByRole('textbox', { name: '덱 이름' })
    await user.clear(nameInput)
    await user.type(nameInput, 'BRAVO')
    await user.tab()

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '내 덱 · BRAVO' })).toBeVisible()
    })
  })

  it('JSON을 분석한 뒤 유닛과 덱에 맞는 가져오기 옵션만 표시한다', async () => {
    const user = userEvent.setup()
    render(<App />)
    await screen.findByRole('combobox', { name: '덱 선택' })

    const unit = createImportUnit()
    const fileInput = screen.getByLabelText('덱 JSON 파일')
    await user.upload(
      fileInput,
      createJsonFile('unit.json', serializeDeckExport(createUnitExport(unit))),
    )

    let dialog = await screen.findByRole('dialog', { name: '가져오기 방식 선택' })
    expect(
      within(dialog).getByRole('button', { name: '선택한 1번 슬롯에 유닛 붙여넣기' }),
    ).toBeVisible()
    expect(
      within(dialog).getByRole('button', { name: '새 덱을 만들어 유닛 가져오기' }),
    ).toBeVisible()
    expect(
      within(dialog).queryByRole('button', { name: '기존 덱과 병합하기' }),
    ).not.toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: '가져오기 취소' }))

    const importedDeck = createDeck('IMPORT', partsCatalog.catalogVersion, {
      id: 'import-deck',
    })
    importedDeck.slots[0] = unit
    await user.upload(
      screen.getByLabelText('덱 JSON 파일'),
      createJsonFile(
        'deck.json',
        serializeDeckExport(createBackupExport([importedDeck])),
      ),
    )

    dialog = await screen.findByRole('dialog', { name: '가져오기 방식 선택' })
    expect(
      within(dialog).getByRole('button', { name: '기존 덱과 병합하기' }),
    ).toBeVisible()
    expect(
      within(dialog).getByRole('button', {
        name: '모든 덱을 가져온 내용으로 교체하기',
      }),
    ).toBeVisible()
    expect(
      within(dialog).queryByRole('button', {
        name: '선택한 1번 슬롯에 유닛 붙여넣기',
      }),
    ).not.toBeInTheDocument()
  })
})
