import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDismissLayer } from '@/hooks/useDismissLayer';

type PreventCallback = (event: { data: { action: { type: string } } }) => void;

const nav = vi.hoisted(() => ({
  os: 'android' as 'android' | 'ios',
  focused: true,
  dispatch: vi.fn(),
  backListeners: [] as (() => boolean)[],
  prevent: { active: false, callback: undefined as PreventCallback | undefined },
}));

vi.mock('react-native', () => ({
  Platform: {
    get OS() {
      return nav.os;
    },
  },
  BackHandler: {
    addEventListener: (_event: string, listener: () => boolean) => {
      nav.backListeners.push(listener);
      return { remove: () => nav.backListeners.splice(nav.backListeners.indexOf(listener), 1) };
    },
  },
}));
vi.mock('expo-router/react-navigation', () => ({
  useNavigation: () => ({ isFocused: () => nav.focused, dispatch: nav.dispatch }),
  usePreventRemove: (active: boolean, callback: PreventCallback) => {
    nav.prevent = { active, callback };
  },
}));

/** A hardware back, as React Native runs it: newest listener first. True when something consumed it. */
function pressBack() {
  let consumed = false;
  act(() => {
    consumed = [...nav.backListeners].reverse().some((listener) => listener());
  });
  return consumed;
}

/** The sheet being swiped down or popped: what react-navigation does when removal is prevented. */
function removeScreen(type = 'POP') {
  act(() => {
    if (nav.prevent.active) {
      nav.prevent.callback?.({ data: { action: { type } } });
    }
  });
}

function mount(open: boolean) {
  const close = vi.fn();
  function Probe(props: { open: boolean }) {
    const layer = useDismissLayer(props.open, close);
    // Save, as the sheets wire it: leave past the layer, then go back.
    return <button onClick={() => layer.leave(() => removeScreen('GO_BACK'))}>Save</button>;
  }
  const view = render(<Probe open={open} />);
  return { close, view, Probe };
}

beforeEach(() => {
  nav.os = 'android';
  nav.focused = true;
  nav.dispatch.mockReset();
  nav.backListeners.length = 0;
  nav.prevent = { active: false, callback: undefined };
});
afterEach(cleanup);

describe('useDismissLayer back', () => {
  it('closes the open layer and consumes the back', () => {
    const { close } = mount(true);
    expect(pressBack()).toBe(true);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('lets the back through once the layer is closed', () => {
    const { close, view, Probe } = mount(true);
    view.rerender(<Probe open={false} />);
    expect(pressBack()).toBe(false);
    expect(close).not.toHaveBeenCalled();
  });

  it('lets the back through to a sheet pushed on top of this screen', () => {
    const { close } = mount(true);
    nav.focused = false;
    expect(pressBack()).toBe(false);
    expect(close).not.toHaveBeenCalled();
  });
});

describe('useDismissLayer swipe-down', () => {
  it('on iOS closes the layer instead of the sheet', () => {
    nav.os = 'ios';
    const { close } = mount(true);
    expect(nav.prevent.active).toBe(true);
    removeScreen();
    expect(close).toHaveBeenCalledTimes(1);
    expect(nav.dispatch).not.toHaveBeenCalled();
  });

  it('on iOS lets Save leave past the open layer', () => {
    nav.os = 'ios';
    const { close, view } = mount(true);
    fireEvent.click(view.getByText('Save'));
    expect(nav.dispatch).toHaveBeenCalledWith({ type: 'GO_BACK' });
    expect(close).not.toHaveBeenCalled();
  });

  it('never prevents removal on Android, where the sheet has already gone natively', () => {
    mount(true);
    expect(nav.prevent.active).toBe(false);
  });
});
