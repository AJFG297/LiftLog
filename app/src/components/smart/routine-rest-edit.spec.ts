import { act, renderHook } from '@testing-library/react';
import { Duration } from '@js-joda/core';
import { describe, expect, it } from 'vitest';
import { SessionBlueprint, WeightedExerciseBlueprint } from '@/models/blueprint-models';
import { makeWeightedBlueprint } from '@/models/session-models/__test__/helpers';
import { exerciseEditAt, updateExerciseEdit } from './exercise-edit-draft';
import {
  isRoutineDraftChanged,
  openRoutineDraft,
  routineDraftAt,
  updateRoutineDraft,
  useOwnedRoutineDraft,
} from './routine-draft';
import { openRoutineRestEdit } from './routine-rest-edit';

const bench = makeWeightedBlueprint({ name: 'Bench', restBetweenSets: { rest: Duration.ofSeconds(90) } });
const squat = makeWeightedBlueprint({ name: 'Squat', restBetweenSets: { rest: Duration.ofSeconds(180) } });
const push = new SessionBlueprint('Push', [bench, squat], '');

const restOf = (exercise: unknown) => (exercise as WeightedExerciseBlueprint).restBetweenSets;
const withRest = (rest: WeightedExerciseBlueprint['restBetweenSets']) => (exercise: unknown) =>
  (exercise as WeightedExerciseBlueprint).with({ restBetweenSets: rest });

describe('openRoutineRestEdit', () => {
  it("puts the rest sheet's change into the routine editor's draft, not the saved routine", () => {
    const location = { programId: 'rest-draft', sessionIndex: 0 };
    const editor = renderHook(() => useOwnedRoutineDraft(location, () => openRoutineDraft(push)));
    const edit = openRoutineRestEdit(location, 1)!;
    const rest = { rest: Duration.ofSeconds(150), failedSetRest: Duration.ofSeconds(240) };

    act(() => updateExerciseEdit(edit.editId, withRest(rest)));

    const exercises = routineDraftAt(location)!.routine.exercises;
    expect(restOf(exercises[1])).toEqual(rest);
    expect(restOf(exercises[0])).toEqual(bench.restBetweenSets);
    expect(isRoutineDraftChanged(editor.result.current)).toBe(true);
    edit.close();
    editor.unmount();
  });

  it('changes only the rest, leaving what the card changed since the sheet opened', () => {
    const location = { programId: 'rest-only', sessionIndex: 0 };
    const editor = renderHook(() => useOwnedRoutineDraft(location, () => openRoutineDraft(push)));
    const edit = openRoutineRestEdit(location, 0)!;
    act(() =>
      updateRoutineDraft(location, (r) =>
        r.withExercise(0, (r.exercises[0] as WeightedExerciseBlueprint).with({ notes: 'Pause' })),
      ),
    );

    act(() => updateExerciseEdit(edit.editId, withRest({ rest: Duration.ofSeconds(120) })));

    const first = routineDraftAt(location)!.routine.exercises[0] as WeightedExerciseBlueprint;
    expect(first.notes).toBe('Pause');
    expect(first.restBetweenSets).toEqual({ rest: Duration.ofSeconds(120) });
    edit.close();
    editor.unmount();
  });

  it('ends the edit when closed, so the sheet has nothing left to change', () => {
    const location = { programId: 'rest-closed', sessionIndex: 0 };
    const editor = renderHook(() => useOwnedRoutineDraft(location, () => openRoutineDraft(push)));
    const edit = openRoutineRestEdit(location, 0)!;

    edit.close();

    expect(exerciseEditAt(edit.editId)).toBeUndefined();
    editor.unmount();
  });

  it('opens nothing without a draft or a weighted exercise there', () => {
    expect(openRoutineRestEdit({ programId: 'no-draft', sessionIndex: 0 }, 0)).toBeUndefined();
  });
});
