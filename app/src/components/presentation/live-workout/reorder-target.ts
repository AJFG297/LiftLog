/**
 * Where a dragged row lands: the index it has passed the middle of. `heights` are the rows' measured
 * heights, in order, `gap` the space between rows, and `dy` how far the row has been dragged from `from`.
 */
export function reorderTargetIndex(heights: readonly number[], gap: number, from: number, dy: number): number {
  'worklet';
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

/** How close to the scroll view's top or bottom edge, in points, a held row starts it scrolling. */
export const AUTO_SCROLL_EDGE = 80;
/** The fastest the list scrolls under a held row, in points per second, reached at the very edge. */
export const AUTO_SCROLL_MAX_SPEED = 1000;

/**
 * How fast to scroll while a row is held with the finger `fingerY` points below the top of a scroll view
 * `viewportHeight` tall: negative scrolls up, positive down, zero outside the edge bands. The speed grows the
 * deeper the finger goes into a band, so the user can creep or race.
 */
export function autoScrollSpeed(fingerY: number, viewportHeight: number): number {
  'worklet';
  const edge = Math.min(AUTO_SCROLL_EDGE, viewportHeight / 3);
  if (edge <= 0) {
    return 0;
  }
  const depth = (into: number) => Math.min(1, Math.max(0, into) / edge);
  if (fingerY < edge) {
    return -AUTO_SCROLL_MAX_SPEED * depth(edge - fingerY);
  }
  if (fingerY > viewportHeight - edge) {
    return AUTO_SCROLL_MAX_SPEED * depth(fingerY - (viewportHeight - edge));
  }
  return 0;
}
