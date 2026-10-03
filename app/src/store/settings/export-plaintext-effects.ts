import { PotentialSet, RecordedCardioExercise, RecordedExercise, Session } from '@/models/session-models';
import type { SetKind } from '@/models/session-models/set-kind';
import { AddEffectFn } from '@/store/store';
import { exportPlainText } from '@/store/settings';
import { match } from 'ts-pattern';
import BigNumber from 'bignumber.js';
import { jsonToCSV } from 'react-native-csv';
import { shortFormatWeightUnit } from '@/models/weight';
import { DateTimeFormatter, LocalDateTime } from '@js-joda/core';

export function addExportPlaintextEffects(addEffect: AddEffectFn) {
  addEffect(exportPlainText, async ({ payload: { format } }, { extra: { workoutRepository, fileExportService } }) => {
    const now = LocalDateTime.now()
      .withNano(0)
      .format(DateTimeFormatter.ISO_LOCAL_DATE_TIME)
      .replaceAll(':', '')
      .replaceAll('T', '_')
      .replaceAll('-', '');
    const batches = workoutRepository.inExportOrder(EXPORT_BATCH_SIZE);
    const [fileName, bytes, contentType] = await match(format)
      .with('CSV', async () => [`liftlog-export.${now}.csv`, await exportToCsv(batches), 'text/csv'] as const)
      .with(
        'JSON',
        async () => [`liftlog-export.${now}.json`, await exportToJson(batches), 'application/json'] as const,
      )
      .exhaustive();

    await fileExportService.exportBytes(fileName, bytes, contentType);
  });
}

/** Workouts are read this many at a time, so the export never holds the whole history as `Session`s. */
const EXPORT_BATCH_SIZE = 200;

// Each workout is serialised as its batch arrives. Joined, the pieces are byte for byte what serialising the
// whole list at once would give, however it is batched.
export async function exportToJson(batches: AsyncIterable<Session[]>): Promise<Uint8Array> {
  const workouts: string[] = [];
  for await (const sessions of batches) {
    for (const session of sessions) {
      // The workout in progress is exported too, and may still hold an RPE picked ahead of an unlogged set.
      const exported = session.withoutUnloggedRpe();
      workouts.push(
        JSON.stringify({
          // oxlint-disable-next-line typescript/no-misused-spread
          ...exported,
          // oxlint-disable-next-line typescript/no-misused-spread
          blueprint: { ...exported.blueprint, exercises: undefined },
        }),
      );
    }
  }
  return new TextEncoder().encode(`[${workouts.join(',')}]`);
}

export async function exportToCsv(batches: AsyncIterable<Session[]>): Promise<Uint8Array> {
  const pieces: string[] = [];
  for await (const sessions of batches) {
    const rows = sessions.flatMap((session) =>
      session.recordedExercises.flatMap((exercise) => ExportedSetCsvRow.fromModel(session, exercise)),
    );
    if (rows.length) {
      // The header goes on the first piece only; Papa joins rows with \r\n, and so are the pieces.
      pieces.push(jsonToCSV(rows, { header: !pieces.length }));
    }
  }
  return new TextEncoder().encode(pieces.join('\r\n'));
}

class ExportedSetCsvRow {
  constructor(
    public SessionId: string,
    public Timestamp: string,
    public Exercise: string,
    public Weight: BigNumber | '',
    public WeightUnit: string,
    public Reps: number,
    public TargetReps: number,
    public Notes: string,
    // RPE and SetType stay last, so tools reading the file by column position keep working.
    public RPE: number | '',
    public SetType: SetKind,
  ) {}
  static fromModel(session: Session, exercise: RecordedExercise): ExportedSetCsvRow[] {
    // TODO: What do we do about cardio?
    if (exercise instanceof RecordedCardioExercise) {
      return [];
    }
    const row = (set: PotentialSet, targetReps: number) =>
      new ExportedSetCsvRow(
        session.id,
        set.set!.completionDateTime.toString(),
        exercise.blueprint.name,
        // An exercise with no load has no weight to report.
        exercise.tracksResistance ? set.weight.value : '',
        exercise.tracksResistance ? shortFormatWeightUnit(set.weight.unit) : '',
        set.set!.repsCompleted,
        targetReps,
        exercise.notes ?? '',
        set.loggedRpe ?? '',
        set.kind,
      );
    // Warm-ups come first, in the order they are done.
    const warmups = exercise.warmupSets.filter((set) => set.set).map((set) => row(set, set.target.max));
    const working = exercise.potentialSets
      .map((set, index) => ({ set, index }))
      .filter((x) => x.set.set)
      .map(({ set, index }) => row(set, exercise.repsTargetForSet(index).max));
    return [...warmups, ...working];
  }
}
