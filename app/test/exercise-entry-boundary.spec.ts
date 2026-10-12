import { ESLint } from 'eslint';
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const eslint = new ESLint({ cwd: process.cwd() });
async function errors(source: string, filePath = 'src/components/smart/entry.tsx') {
  const results = await eslint.lintText(source, { filePath: resolve(filePath) });
  const messages = results.flatMap((result) => result.messages);
  expect(messages.filter((message) => message.fatal)).toEqual([]);
  return messages.filter((message) => message.ruleId === 'storage/exercise-entry');
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
