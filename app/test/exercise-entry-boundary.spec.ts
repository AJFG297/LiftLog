import { ESLint } from 'eslint';
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const eslint = new ESLint({ cwd: process.cwd() });
async function errors(source: string, filePath = 'src/components/smart/entry.tsx', rule = 'storage/exercise-entry') {
  const results = await eslint.lintText(source, { filePath: resolve(filePath) });
  const messages = results.flatMap((result) => result.messages);
  expect(messages.filter((message) => message.fatal)).toEqual([]);
  return messages.filter((message) => message.ruleId === rule);
}

describe('exercise entry ownership', () => {
  it.each([
    "import { sessionWithPickAdded } from '@/models/exercise-pick';",
    "import { sessionWithExerciseSwapped as swap } from '../../models/exercise-pick';",
    "import { sessionWithExerciseEdited } from '@/models/session-models/carry-over';",
    "import { nextRecordedExercise } from '@/models/session-models/carry-over';",
    "import * as transforms from '@/models/exercise-pick';",
    "export { sessionWithExerciseReplaced as replace } from '@/models/session-models/carry-over';",
    "export * from '@/models/exercise-pick';",
    "const entry = await import('@/models/exercise-pick');",
    "const entry = require('@/models/session-models/carry-over');",
    'const entry = require(`@/models/exercise-pick`);',
    'const entry = await import(`@/models/exercise-pick`);',
    "import { type PickedExerciseRef, sessionWithPickAdded } from '@/models/exercise-pick';",
    'session.withAddedExercise(exercise);',
    "session['withAddedExercise'](exercise);",
    'session[`withAddedExercise`](exercise);',
    "session[('withAddedExercise' as const)](exercise);",
    'const { withAddedExercise: add } = session;',
    'const add = session.withAddedExercise;',
  ])('rejects bypass %s', async (source) => {
    expect(await errors(source)).toHaveLength(1);
  });

  it.each([
    [
      "import { blueprintsForPick, withPickAppended, blueprintSwappedTo } from '@/models/exercise-pick';",
      'src/components/smart/routine-editor.tsx',
    ],
    ["import type { PickedExerciseRef } from '@/models/exercise-pick';", 'src/hooks/useAddExercise.ts'],
    ["import { sessionWithPickAdded } from '@/models/exercise-pick';", 'src/store/stored-sessions/exercise-entry.ts'],
    ["import { nextRecordedExercise } from '@/models/session-models/carry-over';", 'src/services/session-service.ts'],
    [
      "import { nextRecordedExercise } from '@/models/session-models/carry-over';",
      'src/components/presentation/workout-editor/progression-preview.ts',
    ],
    [
      "import { nextRecordedExercise } from '@/models/session-models/carry-over';",
      'src/components/smart/exercise-progression-sheet.tsx',
    ],
    ['const entry = require(`@/models/exercise-pick`);', 'src/store/stored-sessions/exercise-entry.ts'],
    ['const entry = await import(`@/models/exercise-pick`);', 'src/store/stored-sessions/exercise-entry.ts'],
    ["import type { sessionWithPickAdded } from '@/models/exercise-pick';", 'src/components/smart/entry.tsx'],
    ["import { type sessionWithExerciseSwapped } from '@/models/exercise-pick';", 'src/components/smart/entry.tsx'],
    ["import type * as Entry from '@/models/exercise-pick';", 'src/components/smart/entry.tsx'],
    [
      "export type { sessionWithExerciseEdited } from '@/models/session-models/carry-over';",
      'src/components/smart/entry.tsx',
    ],
    [
      "export { type sessionWithExerciseEdited } from '@/models/session-models/carry-over';",
      'src/components/smart/entry.tsx',
    ],
    ["export type * from '@/models/session-models/carry-over';", 'src/components/smart/entry.tsx'],
    ['session.withAddedExercise(exercise);', 'src/models/exercise-pick.ts'],
    ['session.withAddedExercise(exercise);', 'src/app/(tabs)/(session)/screenshot-collection.tsx'],
    ['session.withAddedExercise(exercise);', 'src/models/session-models/session.spec.ts'],
    ['void services.exerciseEntry.add({ workoutId, picked, asSuperset: false });', 'src/hooks/useAddExercise.ts'],
  ])('allows domain previews, start, fixture and owner paths', async (source, path) => {
    expect(await errors(source, path)).toEqual([]);
  });

  it('accepts the migrated callers and rejects the historical protocol', async () => {
    for (const file of [
      'src/hooks/useAddExercise.ts',
      'src/components/smart/live-exercise-card.tsx',
      'src/components/smart/session-exercise-draft.ts',
    ]) {
      expect(await errors(await readFile(resolve(file), 'utf8'), file)).toEqual([]);
    }
    expect(
      await errors("import { sessionWithPickAdded } from '@/models/exercise-pick';", 'src/hooks/useAddExercise.ts'),
    ).toHaveLength(1);
  });
});

describe('exercise entry factory ownership', () => {
  it.each([
    "import { createExerciseEntry } from '@/store/stored-sessions/exercise-entry';",
    "import { createExerciseEntry as create } from '../../store/stored-sessions/exercise-entry';",
    "import * as owner from '@/store/stored-sessions/exercise-entry';",
    "import owner from '@/store/stored-sessions/exercise-entry';",
    "import '@/store/stored-sessions/exercise-entry';",
    "import { type ExerciseEntry, createExerciseEntry as create } from '@/store/stored-sessions/exercise-entry';",
    "export { createExerciseEntry as create } from '@/store/stored-sessions/exercise-entry';",
    "export * from '@/store/stored-sessions/exercise-entry';",
    "export * as owner from '@/store/stored-sessions/exercise-entry';",
    "const owner = require('@/store/stored-sessions/exercise-entry');",
    'const owner = require(`@/store/stored-sessions/exercise-entry`);',
    "const owner = await import('@/store/stored-sessions/exercise-entry');",
  ])('rejects runtime factory access outside composition: %s', async (source) => {
    expect(await errors(source, 'src/components/smart/entry.tsx', 'storage/exercise-entry-factory')).toHaveLength(1);
  });

  it('also rejects a factory hidden in a domain model', async () => {
    expect(
      await errors(
        "import { createExerciseEntry } from '../store/stored-sessions/exercise-entry';",
        'src/models/entry.ts',
        'storage/exercise-entry-factory',
      ),
    ).toHaveLength(1);
  });

  it.each([
    ["import { createExerciseEntry } from '@/store/stored-sessions/exercise-entry';", 'src/services/index.ts'],
    [
      "import type { ExerciseEntry, ExerciseTarget } from '@/store/stored-sessions/exercise-entry';",
      'src/components/smart/entry.tsx',
    ],
    ["import { type ExerciseEntry } from '@/store/stored-sessions/exercise-entry';", 'src/components/smart/entry.tsx'],
    ["import type * as Entry from '@/store/stored-sessions/exercise-entry';", 'src/components/smart/entry.tsx'],
    [
      "import type { createExerciseEntry } from '@/store/stored-sessions/exercise-entry';",
      'src/components/smart/entry.tsx',
    ],
    ["export type { ExerciseEntry } from '@/store/stored-sessions/exercise-entry';", 'src/models/entry-types.ts'],
    ["export { type ExerciseTarget } from '@/store/stored-sessions/exercise-entry';", 'src/models/entry-types.ts'],
    ["export type * from '@/store/stored-sessions/exercise-entry';", 'src/models/entry-types.ts'],
    [
      "import { createExerciseEntry } from '@/store/stored-sessions/exercise-entry';",
      'src/store/stored-sessions/exercise-entry.spec.ts',
    ],
  ])('allows composition and erased type access', async (source, path) => {
    expect(await errors(source, path, 'storage/exercise-entry-factory')).toEqual([]);
  });

  it('does not claim indirect dynamic loading or computed module paths', async () => {
    for (const source of [
      "const path = '@/store/stored-sessions/exercise-entry'; const owner = await import(path);",
      "const load = require; const owner = load('@/store/stored-sessions/exercise-entry');",
    ])
      expect(await errors(source, 'src/components/smart/entry.tsx', 'storage/exercise-entry-factory')).toEqual([]);
  });
});
