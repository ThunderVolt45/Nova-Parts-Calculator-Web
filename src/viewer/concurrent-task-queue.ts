export type ConcurrentTaskScheduler = <Result>(
  task: (workerIndex: number) => Promise<Result>,
) => Promise<Result>

export function createConcurrentTaskScheduler(concurrency: number): ConcurrentTaskScheduler {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error('동시 작업 수는 1 이상의 정수여야 합니다.')
  }

  const availableWorkers = Array.from({ length: concurrency }, (_, index) => index)
  const pending: Array<(workerIndex: number) => void> = []

  const drain = () => {
    while (availableWorkers.length > 0 && pending.length > 0) {
      const workerIndex = availableWorkers.shift()!
      pending.shift()!(workerIndex)
    }
  }

  return <Result>(task: (workerIndex: number) => Promise<Result>) =>
    new Promise<Result>((resolve, reject) => {
      pending.push((workerIndex) => {
        void task(workerIndex).then(resolve, reject).finally(() => {
          availableWorkers.push(workerIndex)
          drain()
        })
      })
      drain()
    })
}
