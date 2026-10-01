import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { useBackWhenGone } from '@/hooks/useBackWhenGone';

const { back, router } = vi.hoisted(() => {
  const back = vi.fn();
  // expo-router hands out one router for the app, so the mock does too.
  return { back, router: { back } };
});
vi.mock('expo-router', () => ({ useRouter: () => router }));

function Probe({ gone }: { gone: boolean }) {
  useBackWhenGone(gone);
  return null;
}

describe('useBackWhenGone', () => {
  it('stays while the thing is there and goes back once when it disappears', () => {
    back.mockClear();
    const view = render(<Probe gone={false} />);
    expect(back).toHaveBeenCalledTimes(0);

    view.rerender(<Probe gone={true} />);
    view.rerender(<Probe gone={true} />);
    expect(back).toHaveBeenCalledTimes(1);
  });
});
