import { progressionChoiceOf } from '@/components/presentation/workout-editor/routine-progression';
import { RepsTarget } from '@/models/blueprint-models';
import { RecordedSet, RecordedWeightedExercise } from '@/models/session-models';
import { setKindHas } from '@/models/session-models/set-kind';
import { nextRecordedExercise } from '@/models/session-models/carry-over';
import { WeightUnit } from '@/models/weight';
import { OffsetDateTime } from '@js-joda/core';
import BigNumber from 'bignumber.js';

/** What moved since the session before: the most any set's weight went up, or how far the reps have climbed. */
export type PreviewChange = { axis: 'load'; amount: BigNumber } | { axis: 'reps'; amount: BigNumber };

/**
 * One session of the preview. `after` counts the sessions since next time (0 is next time itself),
 * `weight` is the heaviest working set's and `reps` the working sets' targets.
 */
export interface PreviewSession {
  kind: 'session';
  after: number;
  weight: BigNumber;
  reps: RepsTarget[];
  change: PreviewChange | undefined;
}

/** Stands for the rungs of a long rep ladder left out of the middle. */
export interface PreviewGap {
  kind: 'gap';
}

export type PreviewRow = PreviewSession | PreviewGap;

/** Sessions shown after next time for Add weight and custom rules. */
const SESSIONS_AHEAD = 3;
/** A ladder longer than this many rows shows its first two and last two with a gap between. */
const MAX_LADDER_ROWS = 5;
/** Stops a ladder whose weight rung can never come round, which the rule editor already warns about. */
const MAX_LADDER_SESSIONS = 30;

/**
 * "If you hit every target": the sessions after next time when every set is logged at the top of its
 * target, played out by the workout carry-over engine itself (`nextRecordedExercise`). `start` is the
 * complete exercise next time opens on, including earned weight and rep targets.
 *
 * Add weight and custom rules show three sessions ahead. Reps, then weight runs until the weight goes up,
 * which is the point of the ladder, leaving out the middle rungs of a long one. Off has nothing to show.
 */
export function progressionPreview(start: RecordedWeightedExercise, unit: WeightUnit): PreviewRow[] {
  const exercise = start.blueprint;
  const choice = progressionChoiceOf(exercise.progression);
  if (choice === 'off') {
    return [];
  }
  const first = hitTargets(start, unit);

  const sessions = [first];
  const untilWeightMoves = choice === 'double';
  while (sessions.length <= (untilWeightMoves ? MAX_LADDER_SESSIONS : SESSIONS_AHEAD)) {
    const previous = sessions[sessions.length - 1]!;
    const next = hitTargets(
      nextRecordedExercise(exercise, exercise.progressionKey(), { [exercise.progressionKey()]: previous }, unit),
      unit,
    );
    sessions.push(next);
    if (untilWeightMoves && changeBetween(previous, next, first)?.axis === 'load') {
      break;
    }
  }

  const rows = sessions.map(
    (session, after): PreviewSession => ({
      kind: 'session',
      after,
      weight: BigNumber.max(...workingSets(session).map((s) => s.weight.value)),
      reps: workingSets(session).map((s) => s.target),
      change: after === 0 ? undefined : changeBetween(sessions[after - 1]!, session, first),
    }),
  );
  return rows.length > MAX_LADDER_ROWS ? [...rows.slice(0, 2), { kind: 'gap' }, ...rows.slice(-2)] : rows;
}

function workingSets(exercise: RecordedWeightedExercise) {
  return exercise.potentialSets.filter((s) => setKindHas(s.kind, 'countsTowardsProgression'));
}

/** A weight change wins, since the reps starting over is part of it rather than a change of its own. */
function changeBetween(
  previous: RecordedWeightedExercise,
  next: RecordedWeightedExercise,
  first: RecordedWeightedExercise,
): PreviewChange | undefined {
  const before = workingSets(previous);
  const after = workingSets(next);
  const added = BigNumber.max(0, ...after.map((s, i) => s.weight.value.minus(before[i]?.weight.value ?? 0)));
  if (added.isGreaterThan(0)) {
    return { axis: 'load', amount: added };
  }
  const climbed = (after[0]?.target.max ?? 0) - (workingSets(first)[0]?.target.max ?? 0);
  const moved = after.some((s, i) => s.target.max !== before[i]?.target.max);
  return moved && climbed > 0 ? { axis: 'reps', amount: new BigNumber(climbed) } : undefined;
}

/**
 * Logs every set at the top of its own target. The rules only advance a session that was met, so a
 * session showing anything else would be one that earns nothing.
 */
function hitTargets(exercise: RecordedWeightedExercise, unit: WeightUnit): RecordedWeightedExercise {
  return exercise.potentialSets.reduce(
    (ex, _, index) =>
      ex.withSet(index, (s) =>
        s.with({
          weight: s.weight.convertTo(unit),
          set: RecordedSet.of({
            repsCompleted: ex.repsTargetForSet(index).max,
            completionDateTime: OffsetDateTime.MIN,
          }),
        }),
      ),
    exercise,
  );
}
