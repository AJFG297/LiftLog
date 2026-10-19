import { describe, expect, it } from 'vitest';
import {
  AUTO_SCROLL_EDGE,
  AUTO_SCROLL_MAX_SPEED,
  autoScrollSpeed,
  reorderShiftFor,
  reorderTargetIndex,
} from '@/components/presentation/live-workout/reorder-target';

const heights = [64, 140, 64, 64];
const gap = 6;

describe('reorderTargetIndex', () => {
  it('stays put until the row passes the middle of its neighbour', () => {
    expect(reorderTargetIndex(heights, gap, 0, 0)).toBe(0);
    expect(reorderTargetIndex(heights, gap, 0, 73)).toBe(0);
    expect(reorderTargetIndex(heights, gap, 0, 74)).toBe(1);
  });

  it('walks past several rows of different heights', () => {
    expect(reorderTargetIndex(heights, gap, 0, 146 + 36)).toBe(2);
    expect(reorderTargetIndex(heights, gap, 0, 1000)).toBe(3);
  });

  it('moves upwards with a negative drag', () => {
    expect(reorderTargetIndex(heights, gap, 3, -36)).toBe(2);
    expect(reorderTargetIndex(heights, gap, 3, -(70 + 74))).toBe(1);
    expect(reorderTargetIndex(heights, gap, 3, -1000)).toBe(0);
  });
});

describe('reorderShiftFor', () => {
  it('moves the rows between the start and the target out of the way', () => {
    expect([0, 1, 2, 3].map((index) => reorderShiftFor(index, 0, 2, 64, gap))).toEqual([0, -70, -70, 0]);
    expect([0, 1, 2, 3].map((index) => reorderShiftFor(index, 3, 1, 64, gap))).toEqual([0, 70, 70, 0]);
  });

  it('moves nothing when no row is held', () => {
    expect(reorderShiftFor(1, -1, -1, 64, gap)).toBe(0);
  });
});

describe('autoScrollSpeed', () => {
  const viewport = 600;

  it('stays still away from the edges', () => {
    expect(autoScrollSpeed(AUTO_SCROLL_EDGE, viewport)).toBe(0);
    expect(autoScrollSpeed(viewport / 2, viewport)).toBe(0);
    expect(autoScrollSpeed(viewport - AUTO_SCROLL_EDGE, viewport)).toBe(0);
  });

  it('scrolls up near the top and down near the bottom, faster the closer the finger', () => {
    expect(autoScrollSpeed(AUTO_SCROLL_EDGE / 2, viewport)).toBe(-AUTO_SCROLL_MAX_SPEED / 2);
    expect(autoScrollSpeed(0, viewport)).toBe(-AUTO_SCROLL_MAX_SPEED);
    expect(autoScrollSpeed(viewport - AUTO_SCROLL_EDGE / 2, viewport)).toBe(AUTO_SCROLL_MAX_SPEED / 2);
    expect(autoScrollSpeed(viewport, viewport)).toBe(AUTO_SCROLL_MAX_SPEED);
  });

  it('keeps full speed when the finger goes past the edge', () => {
    expect(autoScrollSpeed(-40, viewport)).toBe(-AUTO_SCROLL_MAX_SPEED);
    expect(autoScrollSpeed(viewport + 40, viewport)).toBe(AUTO_SCROLL_MAX_SPEED);
  });

  it('narrows the bands on a short scroll view so its middle stays still', () => {
    expect(autoScrollSpeed(90, 180)).toBe(0);
    expect(autoScrollSpeed(0, 180)).toBe(-AUTO_SCROLL_MAX_SPEED);
  });
});
