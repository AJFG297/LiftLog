import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { resolve } from 'path';
import BigNumber from 'bignumber.js';
import { RecordedCardioExercise, RecordedWeightedExercise, Session } from '@/models/session-models';
import { AnyVersionSessionJSON } from '@/models/storage/versions/any';
import { sessionMigrations } from '@/models/storage/versions/migrations';
import { Weight } from '@/models/weight';

/**
 * The 420 sessions from `export.liftlogbackup.sqlite.gz`, restored once and saved as serialized sessions
 * sorted by id. The history snapshots load this rather than the backup so they don't depend on the
 * upstream-era restore path, which the storage rewrite deletes. Rows go through the session migration
 * chain, so the fixture keeps loading after a version bump.
 */
export function loadHistoryFixture(): Session[] {
  const json = JSON.parse(
    gunzipSync(readFileSync(resolve(__dirname, 'history-420.sessions.json.gz'))).toString('utf8'),
  ) as AnyVersionSessionJSON[];
  return json.map((x) => Session.fromJSON(sessionMigrations.migrate(x)));
}

export function describeSession(session: Session): string {
  return `${session.date.toString()} ${session.id} ${session.blueprint.name}`;
}

function describeWeight(weight: Weight): string {
  return `${weight.value.toString()}${weight.unit}`;
}

/**
 * A recorded exercise by content rather than identity, so the snapshot holds whichever storage produced the
 * instance. Set times are left out except the latest, which is what every "latest"/"previous" lookup
 * orders by.
 */
export function describeExercise(exercise: RecordedWeightedExercise | RecordedCardioExercise): string {
  const latestTime = exercise.latestTime?.toString() ?? 'not started';
  if (exercise instanceof RecordedWeightedExercise) {
    const sets = exercise.potentialSets
      .map((ps) => {
        const reps = ps.set ? String(ps.set.repsCompleted) : '-';
        const rpe = ps.rpe === undefined ? '' : `@${ps.rpe}`;
        return `${describeWeight(ps.weight)}x${reps}/${ps.target.min}-${ps.target.max}${rpe}`;
      })
      .join(' ');
    return `${exercise.blueprint.name} | ${latestTime} | ${sets}`;
  }
  const sets = exercise.sets
    .map((set) => {
      const { blueprint: _, completionDateTime: __, ...rest } = set.toJSON();
      return JSON.stringify(rest);
    })
    .join(' ');
  return `${exercise.blueprint.name} [cardio] | ${latestTime} | ${sets}`;
}

/**
 * Turns selector output into plain, key-sorted JSON so a snapshot is stable: class instances collapse to
 * readable strings, Maps become sorted objects, and floats are rounded so an unrelated change in summation
 * order can't flip the last digit.
 */
export function normalize(value: unknown): unknown {
  if (value === undefined || value === null) return value;
  if (typeof value === 'number') return Number.isInteger(value) ? value : Number(value.toFixed(9));
  if (typeof value !== 'object') return value;
  if (value instanceof Session) return describeSession(value);
  if (value instanceof RecordedWeightedExercise || value instanceof RecordedCardioExercise) {
    return describeExercise(value);
  }
  if (value instanceof Weight) return describeWeight(value);
  if (value instanceof BigNumber) return value.toString();
  // js-joda values (dates, times, durations) serialize to their ISO strings.
  if ('toJSON' in value) return String((value as { toJSON(): unknown }).toJSON());
  if (value instanceof Map) {
    return Object.fromEntries(
      [...value.entries()].map(([k, v]) => [String(k), normalize(v)] as const).sort(([a], [b]) => a.localeCompare(b)),
    );
  }
  if (Array.isArray(value)) {
    // Stats series are thousands of { dateTime, value } points; one line each keeps the snapshot diffable.
    if (value.length > 0 && value.every(isTimePoint)) {
      return value.map((point) => `${asText(normalize(point.dateTime))} ${asText(normalize(point.value))}`);
    }
    return value.map(normalize);
  }
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, v]) => typeof v !== 'function')
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => [k, normalize(v)]),
  );
}

function isTimePoint(value: unknown): value is { dateTime: unknown; value: unknown } {
  return (
    typeof value === 'object' &&
    value !== null &&
    Object.keys(value).length === 2 &&
    'dateTime' in value &&
    'value' in value
  );
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value : (JSON.stringify(value) ?? '-');
}
