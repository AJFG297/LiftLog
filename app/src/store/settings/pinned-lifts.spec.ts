import { describe, expect, it } from 'vitest';
import { togglePinned } from '@/store/settings/pinned-lifts';

describe('togglePinned', () => {
  it('pins at the end, and unpins a pinned lift', () => {
    expect(togglePinned(['a'], 'b')).toEqual(['a', 'b']);
    expect(togglePinned(['a', 'b', 'c'], 'b')).toEqual(['a', 'c']);
  });
});
