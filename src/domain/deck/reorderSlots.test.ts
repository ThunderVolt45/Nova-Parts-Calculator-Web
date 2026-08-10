import { describe, expect, it } from 'vitest'

import { getSlotIndexAfterReorder, reorderSlots } from './reorderSlots.ts'

describe('덱 슬롯 순서 변경', () => {
  it('앞 슬롯을 뒤로 옮기며 사이 슬롯을 앞으로 당긴다', () => {
    expect(reorderSlots(['A', 'B', 'C', null], 0, 2)).toEqual(['B', 'C', 'A', null])
    expect(getSlotIndexAfterReorder(0, 0, 2)).toBe(2)
    expect(getSlotIndexAfterReorder(1, 0, 2)).toBe(0)
  })

  it('뒤 슬롯을 앞으로 옮기며 사이 슬롯을 뒤로 민다', () => {
    expect(reorderSlots(['A', null, 'B', 'C'], 3, 1)).toEqual(['A', 'C', null, 'B'])
    expect(getSlotIndexAfterReorder(3, 3, 1)).toBe(1)
    expect(getSlotIndexAfterReorder(1, 3, 1)).toBe(2)
  })

  it('범위를 벗어난 슬롯은 거부한다', () => {
    expect(() => reorderSlots(['A'], 0, 1)).toThrow(RangeError)
  })
})
