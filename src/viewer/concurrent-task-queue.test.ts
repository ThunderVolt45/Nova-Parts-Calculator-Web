import { describe, expect, it, vi } from 'vitest'

import { createConcurrentTaskScheduler } from './concurrent-task-queue.ts'

describe('동시 썸네일 작업 큐', () => {
  it('지정한 작업 수까지만 동시에 실행하고 완료된 슬롯을 재사용한다', async () => {
    const schedule = createConcurrentTaskScheduler(3)
    let active = 0
    let started = 0
    let maximumActive = 0
    const releases: Array<() => void> = []

    const tasks = Array.from({ length: 6 }, (_, index) => schedule(async (workerIndex) => {
      started += 1
      active += 1
      maximumActive = Math.max(maximumActive, active)
      await new Promise<void>((resolve) => releases.push(resolve))
      active -= 1
      return { index, workerIndex }
    }))

    await vi.waitFor(() => expect(started).toBe(3))
    expect(active).toBe(3)
    expect(maximumActive).toBe(3)
    releases.splice(0).forEach((release) => release())
    await vi.waitFor(() => expect(started).toBe(6))
    expect(active).toBe(3)
    releases.splice(0).forEach((release) => release())

    const results = await Promise.all(tasks)
    expect(new Set(results.map(({ workerIndex }) => workerIndex))).toEqual(new Set([0, 1, 2]))
    expect(maximumActive).toBe(3)
  })

  it('잘못된 동시 작업 수를 거부한다', () => {
    expect(() => createConcurrentTaskScheduler(0)).toThrow()
    expect(() => createConcurrentTaskScheduler(1.5)).toThrow()
  })
})
