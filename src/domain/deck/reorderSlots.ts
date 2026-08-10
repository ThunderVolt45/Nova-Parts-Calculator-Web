export function reorderSlots<T>(
  slots: ReadonlyArray<T>,
  sourceIndex: number,
  targetIndex: number,
): T[] {
  assertSlotIndex(slots, sourceIndex)
  assertSlotIndex(slots, targetIndex)

  const reordered = [...slots]
  const [movedSlot] = reordered.splice(sourceIndex, 1)
  reordered.splice(targetIndex, 0, movedSlot)
  return reordered
}

export function getSlotIndexAfterReorder(
  slotIndex: number,
  sourceIndex: number,
  targetIndex: number,
) {
  if (slotIndex === sourceIndex) return targetIndex
  if (sourceIndex < targetIndex && slotIndex > sourceIndex && slotIndex <= targetIndex) {
    return slotIndex - 1
  }
  if (sourceIndex > targetIndex && slotIndex >= targetIndex && slotIndex < sourceIndex) {
    return slotIndex + 1
  }
  return slotIndex
}

function assertSlotIndex<T>(slots: ReadonlyArray<T>, index: number) {
  if (!Number.isInteger(index) || index < 0 || index >= slots.length) {
    throw new RangeError(`Invalid slot index: ${index}`)
  }
}
