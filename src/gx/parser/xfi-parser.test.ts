import { describe, expect, it } from 'vitest'

import { GxParseError } from './binary.ts'
import { parseXfi } from './xfi-parser.ts'

const identityRows = [
  '1,0,0,0,',
  '0,1,0,0,',
  '0,0,1,0,',
  '0,0,0,1,',
]

describe('XFI 텍스트 파서', () => {
  it('유닛 타입, 소켓 행렬과 애니메이션 범위를 읽는다', () => {
    const text = [
      '0,',
      ...identityRows,
      '3,',
      '0,0,40,',
      '1,41,80,',
      '3,81,120,',
    ].join('\n')

    const result = parseXfi(text, { expectedPartType: 0, socketCount: 1 })

    expect(result.partType).toBe(0)
    expect(result.matrices).toEqual([
      [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    ])
    expect(result.animationRanges).toEqual([
      { animationId: 0, start: 0, end: 40, clip: 'idle' },
      { animationId: 1, start: 41, end: 80, clip: 'move' },
      { animationId: 3, start: 81, end: 120, clip: 'attack' },
    ])
    expect(result.diagnostics).toEqual([])
  })

  it('옵션이 없으면 파일 안의 첫 연속 4×4 행렬을 찾는다', () => {
    const result = parseXfi(['body,', ...identityRows].join('\n'))
    expect(result.partType).toBeNull()
    expect(result.matrices).toHaveLength(1)
    expect(result.diagnostics.map((item) => item.code)).toContain(
      'NO_XFI_ANIMATION_RANGES',
    )
  })

  it('타입 불일치, 잘린 행렬과 빈 파일을 거부한다', () => {
    expect(() =>
      parseXfi(['1,', ...identityRows].join('\n'), {
        expectedPartType: 0,
        socketCount: 1,
      }),
    ).toThrowError(GxParseError)
    expect(() =>
      parseXfi(['0,', ...identityRows.slice(0, 3)].join('\n'), {
        socketCount: 1,
      }),
    ).toThrow('소켓 행렬 0')
    expect(() => parseXfi(' \n ')).toThrow('비어 있습니다')
  })
})

