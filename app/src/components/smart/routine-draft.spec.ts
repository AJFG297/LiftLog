import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SessionBlueprint } from '@/models/blueprint-models';
import {
  isRoutineDraftChanged,
  markRoutineDraftSaved,
  openRoutineDraft,
  routineDraftAt,
  updateRoutineDraft,
  useOwnedRoutineDraft,
} from './routine-draft';

const push = new SessionBlueprint('Push', [], '');

describe('useOwnedRoutineDraft', () => {
  it('keeps the draft while a second editor on the same routine is still open', () => {
    const location = { programId: 'shared', sessionIndex: 0 };
    const first = renderHook(() => useOwnedRoutineDraft(location, () => openRoutineDraft(push)));
    act(() => updateRoutineDraft(location, (r) => r.withName('Push day')));
    const second = renderHook(() => useOwnedRoutineDraft(location, () => openRoutineDraft(push)));
    expect(second.result.current.routine.name).toBe('Push day');

    second.unmount();

    expect(routineDraftAt(location)?.routine.name).toBe('Push day');
    act(() => updateRoutineDraft(location, (r) => r.withNotes('Heavy')));
    expect(first.result.current.routine.notes).toBe('Heavy');

    first.unmount();
    expect(routineDraftAt(location)).toBeUndefined();
  });

  it('opens a fresh draft once every editor has closed', () => {
    const location = { programId: 'fresh', sessionIndex: 0 };
    const first = renderHook(() => useOwnedRoutineDraft(location, () => openRoutineDraft(push)));
    act(() => updateRoutineDraft(location, (r) => r.withName('Changed')));
    first.unmount();

    const again = renderHook(() => useOwnedRoutineDraft(location, () => openRoutineDraft(push)));
    expect(again.result.current.routine.name).toBe('Push');
    again.unmount();
  });
});

describe('markRoutineDraftSaved', () => {
  it('leaves nothing unsaved for an editor still open on the routine', () => {
    const location = { programId: 'saved', sessionIndex: 0 };
    const editor = renderHook(() => useOwnedRoutineDraft(location, () => openRoutineDraft(push)));
    act(() => updateRoutineDraft(location, (r) => r.withName('Push day')));
    expect(isRoutineDraftChanged(editor.result.current)).toBe(true);

    act(() => markRoutineDraftSaved(location, editor.result.current.routine));

    expect(isRoutineDraftChanged(editor.result.current)).toBe(false);
    editor.unmount();
  });
});
