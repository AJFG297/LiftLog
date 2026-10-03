import { act, renderHook } from '@testing-library/react';
import { LocalDate } from '@js-joda/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useToday } from '@/hooks/useToday';

const listeners: ((state: string) => void)[] = [];

vi.mock('react-native', () => ({
  AppState: {
    addEventListener: (_: string, listener: (state: string) => void) => {
      listeners.push(listener);
      return { remove: () => listeners.splice(listeners.indexOf(listener), 1) };
    },
  },
}));

describe('useToday', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 27, 22, 0));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('moves on to the new day when the app comes back on a later day', () => {
    const { result } = renderHook(() => useToday());
    expect(result.current).toEqual(LocalDate.of(2026, 9, 27));

    vi.setSystemTime(new Date(2026, 8, 28, 7, 0));
    act(() => listeners.forEach((listener) => listener('active')));

    expect(result.current).toEqual(LocalDate.of(2026, 9, 28));
  });

  it('keeps the same object when the app comes back on the same day', () => {
    const { result } = renderHook(() => useToday());
    const first = result.current;

    vi.setSystemTime(new Date(2026, 8, 27, 23, 0));
    act(() => listeners.forEach((listener) => listener('active')));

    expect(result.current).toBe(first);
  });
});
