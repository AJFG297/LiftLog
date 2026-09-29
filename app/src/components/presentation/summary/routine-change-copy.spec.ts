import { describe, expect, it, vi } from 'vitest';
import { Duration } from '@js-joda/core';
import { UseTranslateResult } from '@tolgee/react';
import en from '@/i18n/en.json';
import { diffSessionBlueprints } from '@/models/blueprint-diff';
import { SessionBlueprint } from '@/models/blueprint-models';
import { makeWeightedBlueprint } from '@/models/session-models/__test__/helpers';
import { routineChanges } from '@/models/routine-update';
import { routineChangeCopy } from '@/components/presentation/summary/routine-change-copy';

vi.mock('expo-localization', () => ({
  getLocales: () => [{ decimalSeparator: '.' }],
}));

/** The English strings with their placeholders filled, the way Tolgee's simple formatter does it. */
const t = ((key: string, params?: Record<string, string | number>) =>
  (en as Record<string, string>)[key]!.replace(/\{(\w+)\}/g, (_, name: string) =>
    String(params?.[name]),
  )) as UseTranslateResult['t'];

const bench = makeWeightedBlueprint({ name: 'Bench Press', sets: 3 });
const press = makeWeightedBlueprint({ name: 'Overhead Press', sets: 3 });
const fly = makeWeightedBlueprint({ name: 'Cable Fly', sets: 3 });

function copyFor(before: SessionBlueprint['exercises'], after: SessionBlueprint['exercises']) {
  const diff = diffSessionBlueprints(new SessionBlueprint('Push', before, ''), new SessionBlueprint('Push', after, ''));
  return routineChanges(diff).map((row) => routineChangeCopy(t, row));
}

describe('routineChangeCopy', () => {
  it('says where an added exercise goes', () => {
    expect(copyFor([bench, fly], [bench, fly, makeWeightedBlueprint({ name: 'Lateral Raise', sets: 1 })])).toEqual([
      { icon: 'add', title: 'Add Lateral Raise', subtitle: '1 set, after Cable Fly' },
    ]);
    expect(copyFor([bench], [fly, bench])).toEqual([
      { icon: 'add', title: 'Add Cable Fly', subtitle: '3 sets, at the start' },
    ]);
  });

  it('names both exercises of a swap', () => {
    expect(copyFor([bench, press], [bench.with({ name: 'Incline Dumbbell Press' }), press])).toEqual([
      { icon: 'swapHoriz', title: 'Swap Bench Press for Incline Dumbbell Press', subtitle: 'You swapped it today' },
    ]);
  });

  it('gives a set count change with how many sets moved', () => {
    expect(copyFor([press], [press.with({ sets: 4 })])).toEqual([
      { icon: 'notes', title: 'Overhead Press: 3 → 4 sets', subtitle: 'You added a set today' },
    ]);
    expect(copyFor([press], [press.with({ sets: 1 })])).toEqual([
      { icon: 'notes', title: 'Overhead Press: 3 → 1 set', subtitle: 'You removed 2 sets today' },
    ]);
  });

  it('gives rest as the shown rest time', () => {
    const shorter = bench.with({ restBetweenSets: { ...bench.restBetweenSets, minRest: Duration.ofMinutes(2) } });

    expect(copyFor([bench], [shorter])).toEqual([
      { icon: 'timer', title: 'Bench Press rest: 1:30 → 2:00', subtitle: 'You changed it today' },
    ]);
  });

  it('names the exercise a superset joins', () => {
    expect(copyFor([bench, fly], [bench.with({ supersetWithNext: true }), fly])).toEqual([
      { icon: 'link', title: 'Superset Bench Press with Cable Fly', subtitle: 'You changed it today' },
    ]);
  });

  it('falls back to the field and its change for anything else', () => {
    expect(copyFor([bench], [bench.with({ notes: 'Pause at the chest' })])).toEqual([
      { icon: 'edit', title: 'Bench Press: Notes', subtitle: 'Updated' },
    ]);
  });
});
