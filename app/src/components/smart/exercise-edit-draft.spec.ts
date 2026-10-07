import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ExerciseBlueprint } from '@/models/blueprint-models';
import { makeWeightedBlueprint } from '@/models/session-models/__test__/helpers';
import {
  exerciseEditAt,
  openExerciseEdit,
  updateExerciseEdit,
  useExerciseEdit,
  useOwnedExerciseEdit,
} from './exercise-edit-draft';

const bench = makeWeightedBlueprint({ name: 'Bench', sets: 3, repsConfig: { type: 'fixed', reps: 8 } });

describe('exercise edit', () => {
  it('hands each change to the owner and keeps it for the next', () => {
    const onChange = vi.fn();
    const close = openExerciseEdit('a', bench, onChange);

    updateExerciseEdit('a', (e) => e.with({ notes: 'Pause' }));
    updateExerciseEdit('a', (e) => e.with({ link: 'https://example.com' }));

    expect(onChange).toHaveBeenCalledTimes(2);
    const last = onChange.mock.calls[1]![0] as ExerciseBlueprint;
    expect(last.notes).toBe('Pause');
    expect(last.link).toBe('https://example.com');
    close();
  });

  it('ignores a change once the editor has gone', () => {
    const onChange = vi.fn();
    const close = openExerciseEdit('b', bench, onChange);
    close();

    updateExerciseEdit('b', (e) => e.with({ notes: 'Late' }));

    expect(onChange).not.toHaveBeenCalled();
    expect(exerciseEditAt('b')).toBeUndefined();
  });

  it('does not report an update that changes nothing', () => {
    const onChange = vi.fn();
    const close = openExerciseEdit('c', bench, onChange);

    updateExerciseEdit('c', (e) => e);

    expect(onChange).not.toHaveBeenCalled();
    close();
  });
});

describe('useOwnedExerciseEdit', () => {
  it('lets a sheet over the editor change the exercise the editor shows', () => {
    const onChange = vi.fn();
    const editor = renderHook(() => useOwnedExerciseEdit(bench, onChange));
    const { editId } = editor.result.current;
    const sheet = renderHook(() => useExerciseEdit(editId));

    act(() => updateExerciseEdit(editId, (e) => e.with({ resistance: 'bodyweight' })));

    expect((sheet.result.current as typeof bench | undefined)?.resistance).toBe('bodyweight');
    expect((editor.result.current.exercise as typeof bench).resistance).toBe('bodyweight');
    expect(onChange).toHaveBeenCalledTimes(1);

    editor.unmount();
    expect(sheet.result.current).toBeUndefined();
  });
});
