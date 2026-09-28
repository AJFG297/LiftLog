/**
 * Where a dragged row lands: the index it has passed the middle of. `heights` are the rows' measured
 * heights, in order, `gap` the space between rows, and `dy` how far the row has been dragged from `from`.
 */
export function reorderTargetIndex(heights: readonly number[], gap: number, from: number, dy: number): number {
  const direction = Math.sign(dy);
  let target = from;
  let travelled = 0;
  for (let index = from + direction; direction !== 0 && index >= 0 && index < heights.length; index += direction) {
    const step = (heights[index] ?? 0) + gap;
    if (Math.abs(dy) <= travelled + step / 2) {
      break;
    }
    target = index;
    travelled += step;
  }
  return target;
}

/**
 * How far the row at `index` moves aside while row `from` is held over `target`: up by the dragged row's
 * height when it is dragged past downwards, down when upwards.
 */
export function reorderShiftFor(
  index: number,
  from: number,
  target: number,
  draggedHeight: number,
  gap: number,
): number {
  'worklet';
  if (from < 0 || index === from) {
    return 0;
  }
  if (from < target && index > from && index <= target) {
    return -(draggedHeight + gap);
  }
  if (target < from && index >= target && index < from) {
    return draggedHeight + gap;
  }
  return 0;
}
