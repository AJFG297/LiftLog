import { describe, expect, it } from 'vitest';
import { Duration, LocalDate, OffsetDateTime } from '@js-joda/core';
import { Rest, SessionBlueprint, WeightedExerciseBlueprint } from '@/models/blueprint-models';
import { RecordedWeightedExercise } from '@/models/session-models/recorded-weighted-exercise';
import {
  exerciseRestOf,
  isRestCue,
  isRestPreset,
  restOwnerIndexOf,
  restPhaseAt,
  restWindowOf,
  withRestSkipped,
  withRestStarted,
  withRestStepped,
} from '@/models/session-models/rest';
import { RestTimer } from '@/models/session-models/rest-timer';
import { Session } from '@/models/session-models/session';
import {
  emptyPotentialSet,
  filledPotentialSet,
  makeCardioBlueprint,
  makeSession,
  makeWeightedBlueprint,
} from '@/models/session-models/__test__/helpers';

const loggedAt = OffsetDateTime.parse('2026-09-29T10:00:00Z');
const at = (seconds: number) => loggedAt.plusSeconds(seconds);

// 2:00 min rest, a window to 3:00, and 4:00 after a missed set.
const rest: Rest = {
  minRest: Duration.ofSeconds(120),
  maxRest: Duration.ofSeconds(180),
  failureRest: Duration.ofSeconds(240),
};

function benchBlueprint(): WeightedExerciseBlueprint {
  return makeWeightedBlueprint({ name: 'Bench Press', restBetweenSets: rest });
}

/** Bench Press with one set logged at `loggedAt` (10 reps hits the target, fewer misses it) and one to go. Null: no timer. */
function resting(reps = 10, timer: RestTimer | null = new RestTimer(loggedAt)): Session {
  const bp = benchBlueprint();
  const exercise = new RecordedWeightedExercise(
    bp,
    [filledPotentialSet(reps, loggedAt), emptyPotentialSet()],
    undefined,
  );
  return new Session(
    's',
    new SessionBlueprint('Push', [bp], ''),
    [exercise],
    LocalDate.of(2026, 9, 29),
    undefined,
    timer ?? undefined,
  );
}

const seconds = (d: Duration | undefined) => (d === undefined ? undefined : d.toMillis() / 1000);

describe('restWindowOf', () => {
  it('runs for the min rest after a set that hit its target, with the window to max rest after it', () => {
    const window = restWindowOf(resting())!;
    expect(window.readyAt.toString()).toBe('2026-09-29T10:02Z');
    expect(window.fullAt.toString()).toBe('2026-09-29T10:03Z');
    expect(seconds(window.length)).toBe(120);
  });

  it('runs for the failure rest after a missed set, with no window after it', () => {
    const window = restWindowOf(resting(7))!;
    expect(window.readyAt.toString()).toBe('2026-09-29T10:04Z');
    expect(window.fullAt.toString()).toBe('2026-09-29T10:04Z');
  });

  it('runs for a picked length, keeping the window width after it', () => {
    const window = restWindowOf(resting(10, new RestTimer(loggedAt, Duration.ofSeconds(90))))!;
    expect(window.readyAt.toString()).toBe('2026-09-29T10:01:30Z');
    expect(window.fullAt.toString()).toBe('2026-09-29T10:02:30Z');
  });

  it('has nothing to run without a timer, or once the workout has no set left', () => {
    expect(restWindowOf(resting(10, null))).toBeUndefined();
    const bp = benchBlueprint();
    const done = new Session(
      's',
      new SessionBlueprint('Push', [bp], ''),
      [new RecordedWeightedExercise(bp, [filledPotentialSet(10, loggedAt)], undefined)],
      LocalDate.of(2026, 9, 29),
      undefined,
      new RestTimer(loggedAt),
    );
    expect(restWindowOf(done)).toBeUndefined();
  });

  it('runs a timer started from the sheet before any set is logged', () => {
    const session = makeSession([benchBlueprint()]).with({
      restTimer: new RestTimer(loggedAt, Duration.ofSeconds(60)),
    });
    const window = restWindowOf(session)!;
    expect(window.readyAt.toString()).toBe('2026-09-29T10:01Z');
    expect(window.fullAt.toString()).toBe('2026-09-29T10:01Z');
  });
});

describe('rest during a cardio set', () => {
  it('has nothing to count down while a cardio clock is running', () => {
    const session = makeSession([benchBlueprint(), makeCardioBlueprint(2)]).with({
      restTimer: new RestTimer(loggedAt, Duration.ofSeconds(60)),
    });
    expect(seconds(restWindowOf(session)?.length)).toBe(60);

    const running = session.withCardioTimerStarted(1, 0, at(30));

    expect(restWindowOf(running)).toBeUndefined();
    expect(running.restTimerEndTime).toBeUndefined();
    expect(restPhaseAt(running, at(60)).kind).toBe('idle');
  });
});

describe('isRestPreset', () => {
  it('offers to keep only a preset, not a length +15 made', () => {
    expect(isRestPreset(Duration.ofSeconds(120))).toBe(true);
    expect(isRestPreset(Duration.ofSeconds(135))).toBe(false);
    // A missed set rests 4:00; +15 early on makes 4:15, which is no rest the lifter picked.
    const stepped = withRestStepped(resting(8), 1, at(5));
    expect(seconds(stepped.restTimer?.length)).toBe(255);
    expect(isRestPreset(stepped.restTimer!.length!)).toBe(false);
  });
});

describe('restPhaseAt', () => {
  it('counts down, then reads Go, then marks the end of the window', () => {
    const session = resting();
    expect(restPhaseAt(session, at(30))).toEqual({
      kind: 'resting',
      remaining: Duration.ofSeconds(90),
      length: Duration.ofSeconds(120),
    });
    expect(restPhaseAt(session, at(120))).toEqual({ kind: 'ready', pastFull: false });
    expect(restPhaseAt(session, at(180))).toEqual({ kind: 'ready', pastFull: true });
  });

  it('is idle without a timer', () => {
    expect(restPhaseAt(resting(10, null), at(30))).toEqual({ kind: 'idle' });
  });
});

describe('withRestStepped', () => {
  const remainingAt = (session: Session, now: OffsetDateTime) => {
    const phase = restPhaseAt(session, now);
    return phase.kind === 'resting' ? seconds(phase.remaining) : phase.kind;
  };

  it('takes 15 seconds off the countdown', () => {
    const stepped = withRestStepped(resting(), -1, at(30));
    expect(remainingAt(stepped, at(30))).toBe(75);
    expect(stepped.restTimer!.startedAt.toString()).toBe('2026-09-29T09:59:45Z');
    expect(stepped.restTimer!.length).toBeUndefined();
  });

  it('stops -15 one second short of the end', () => {
    const stepped = withRestStepped(resting(), -1, at(110));
    expect(remainingAt(stepped, at(110))).toBe(1);
    expect(withRestStepped(stepped, -1, at(110))).toBe(stepped);
  });

  it('adds 15 seconds by moving the start forward, leaving the length alone', () => {
    const stepped = withRestStepped(resting(), 1, at(30));
    expect(remainingAt(stepped, at(30))).toBe(105);
    expect(stepped.restTimer!.startedAt.toString()).toBe('2026-09-29T10:00:15Z');
    expect(stepped.restTimer!.length).toBeUndefined();
  });

  it('lengthens the rest instead in its first 15 seconds, so it never starts in the future', () => {
    const stepped = withRestStepped(resting(), 1, at(5));
    expect(remainingAt(stepped, at(5))).toBe(130);
    expect(stepped.restTimer!.startedAt.toString()).toBe('2026-09-29T10:00Z');
    expect(seconds(stepped.restTimer!.length)).toBe(135);
  });

  it('leaves a finished or missing countdown alone', () => {
    const over = resting();
    expect(withRestStepped(over, 1, at(150))).toBe(over);
    expect(withRestStepped(over, -1, at(150))).toBe(over);
    const idle = resting(10, null);
    expect(withRestStepped(idle, 1, at(30))).toBe(idle);
  });
});

describe('withRestStarted', () => {
  it('restarts a running rest at the preset length', () => {
    const restarted = withRestStarted(resting(), Duration.ofSeconds(90), at(40));
    expect(restarted.restTimer!.startedAt.toString()).toBe('2026-09-29T10:00:40Z');
    expect(seconds(restarted.restTimer!.length)).toBe(90);
    expect(restPhaseAt(restarted, at(40))).toEqual({
      kind: 'resting',
      remaining: Duration.ofSeconds(90),
      length: Duration.ofSeconds(90),
    });
  });

  it('starts a timer when nothing is running', () => {
    const started = withRestStarted(resting(10, null), Duration.ofSeconds(30), at(200));
    expect(restPhaseAt(started, at(210))).toEqual({
      kind: 'resting',
      remaining: Duration.ofSeconds(20),
      length: Duration.ofSeconds(30),
    });
  });
});

describe('withRestSkipped', () => {
  it('clears the timer, so the pill goes idle', () => {
    const skipped = withRestSkipped(resting());
    expect(skipped.restTimer).toBeUndefined();
    expect(restPhaseAt(skipped, at(30))).toEqual({ kind: 'idle' });
  });
});

describe('exerciseRestOf and restOwnerIndexOf', () => {
  it("reads the exercise's own min rest", () => {
    expect(seconds(exerciseRestOf(resting().recordedExercises[0]))).toBe(120);
  });

  it('gives the rest to the exercise whose set started it, or to the one on screen before any set', () => {
    const squat = makeWeightedBlueprint({ name: 'Squat' });
    const session = makeSession([squat, benchBlueprint()]);
    expect(restOwnerIndexOf(session, 1)).toBe(1);
    const logged = session.withExercise(
      0,
      new RecordedWeightedExercise(squat, [filledPotentialSet(10, loggedAt), emptyPotentialSet()], undefined),
    );
    expect(restOwnerIndexOf(logged, 1)).toBe(0);
  });
});

describe('isRestCue', () => {
  const window = restWindowOf(resting())!;
  const restingPhase = restPhaseAt(resting(), at(119));

  it('buzzes when the countdown runs out, and again at the end of the window', () => {
    expect(isRestCue(restingPhase, restPhaseAt(resting(), at(120)), window, at(120))).toBe(true);
    const ready = restPhaseAt(resting(), at(179));
    expect(isRestCue(ready, restPhaseAt(resting(), at(180)), window, at(180))).toBe(true);
  });

  it('stays quiet for a crossing noticed late, or a tick that crosses nothing', () => {
    expect(isRestCue(restingPhase, restPhaseAt(resting(), at(125)), window, at(125))).toBe(false);
    const ready = restPhaseAt(resting(), at(130));
    expect(isRestCue(ready, restPhaseAt(resting(), at(131)), window, at(131))).toBe(false);
    expect(isRestCue(restingPhase, { kind: 'idle' }, window, at(120))).toBe(false);
  });
});
