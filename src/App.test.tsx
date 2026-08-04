// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'

import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'

import App from './App.tsx'

afterEach(cleanup)

describe('T09 부품 선택 및 강화 UI', () => {
  it('부품을 이름으로 검색하고 상세 확인 후 적용한다', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: /다리 부품 변경/ }))
    const dialog = screen.getByRole('dialog', { name: '다리 선택' })
    const search = within(dialog).getByRole('searchbox', { name: '다리 부품 검색' })

    await user.type(search, '로드런너')
    await user.click(within(dialog).getByRole('button', { name: '로드런너' }))
    expect(within(dialog).getByRole('heading', { name: '로드런너' })).toBeVisible()

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
    expect(within(dialog).getByRole('button', { name: '부품 없음' })).toBeVisible()

    await user.click(within(dialog).getByRole('button', { name: '어깨형' }))
    expect(within(dialog).getByRole('button', { name: '부품 없음' })).toBeVisible()
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
    expect(within(dialog).getByRole('button', { name: '부품 없음' })).toBeVisible()

    await user.click(within(dialog).getByRole('button', { name: '지상' }))
    expect(within(dialog).getByRole('button', { name: '로드런너' })).toBeVisible()
    expect(within(dialog).queryByRole('button', { name: '패트롤' })).not.toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: '부품 없음' })).toBeVisible()
  })
})

describe('T10 계산 결과 및 시뮬레이션 UI', () => {
  it('기본과 최종 능력치를 구분하고 적용 조건을 초기화한다', async () => {
    const user = userEvent.setup()
    render(<App />)

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
