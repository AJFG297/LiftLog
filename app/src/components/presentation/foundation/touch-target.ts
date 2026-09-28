import type { Insets } from 'react-native';

/** The smallest hit area an interactive primitive may have, in points (Apple HIG; ADR-0002). */
export const MIN_TOUCH_TARGET = 44;

/**
 * The `hitSlop` that grows a control out to MIN_TOUCH_TARGET on each axis. React Native drops a tap outside
 * the parent's bounds, so this only helps when the parent has room for the slop (the segmented control's own
 * padding). Otherwise make the Pressable itself 44pt and draw the smaller shape inside it, as `Chip` does.
 */
export function hitSlopFor(size: { width: number; height: number }): Insets {
  const horizontal = Math.max(0, (MIN_TOUCH_TARGET - size.width) / 2);
  const vertical = Math.max(0, (MIN_TOUCH_TARGET - size.height) / 2);
  return { top: vertical, bottom: vertical, left: horizontal, right: horizontal };
}
