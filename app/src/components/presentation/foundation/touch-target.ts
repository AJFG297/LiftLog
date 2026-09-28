import type { Insets } from 'react-native';

/** The smallest hit area an interactive primitive may have, in points (Apple HIG; ADR-0002). */
export const MIN_TOUCH_TARGET = 44;

/**
 * The `hitSlop` that grows a compact control out to MIN_TOUCH_TARGET on each axis, so it can stay small on
 * screen (a 36pt chip in a row of RPE values) and still be easy to hit.
 */
export function hitSlopFor(size: { width: number; height: number }): Insets {
  const horizontal = Math.max(0, (MIN_TOUCH_TARGET - size.width) / 2);
  const vertical = Math.max(0, (MIN_TOUCH_TARGET - size.height) / 2);
  return { top: vertical, bottom: vertical, left: horizontal, right: horizontal };
}
