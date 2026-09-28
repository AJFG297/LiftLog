/** What a set is for. Everything a kind changes is in {@link SET_KIND_RULES}. */
export type SetKind = 'working' | 'warmup' | 'drop' | 'myo' | 'failure';

/**
 * The kinds a planned or working-list set can be. Warm-ups have their own list, in the plan and in the
 * session, because they are planned differently (a share of the top set, or a fixed weight).
 */
export type WorkingListKind = Exclude<SetKind, 'warmup'>;

/** Which of an exercise's two set lists a slot lives in. */
export type SetList = 'warmup' | 'working';

export interface SetKindRules {
  countsTowardsVolume: boolean;
  countsTowardsPrs: boolean;
  /** Whether the set has to meet its target for the progression rules to fire, and whether they move it. */
  countsTowardsProgression: boolean;
  /**
   * Whether the set's numbers carry into the next session's progression: its weight, and its reps where reps
   * are progressed. A kind that doesn't still opens on its own weight from last time, but only its own.
   */
  carriesOver: boolean;
  /** What stands in for the set's number. Only working sets are numbered. */
  letter: string | null;
}

export const SET_KIND_RULES = {
  working: {
    countsTowardsVolume: true,
    countsTowardsPrs: true,
    countsTowardsProgression: true,
    carriesOver: true,
    letter: null,
  },
  warmup: {
    countsTowardsVolume: false,
    countsTowardsPrs: false,
    countsTowardsProgression: false,
    carriesOver: false,
    letter: 'W',
  },
  failure: {
    countsTowardsVolume: true,
    countsTowardsPrs: true,
    countsTowardsProgression: true,
    carriesOver: true,
    letter: 'F',
  },
  drop: {
    countsTowardsVolume: true,
    countsTowardsPrs: false,
    countsTowardsProgression: false,
    carriesOver: false,
    letter: 'D',
  },
  myo: {
    countsTowardsVolume: true,
    countsTowardsPrs: false,
    countsTowardsProgression: false,
    carriesOver: false,
    letter: 'M',
  },
} as const satisfies Record<SetKind, SetKindRules>;

/** The kinds that show a letter rather than a number. */
export type LetteredSetKind = Exclude<SetKind, 'working'>;

export type SetKindLetter = (typeof SET_KIND_RULES)[LetteredSetKind]['letter'];

export type SetKindRule = Exclude<keyof SetKindRules, 'letter'>;

export function setKindHas(kind: SetKind, rule: SetKindRule): boolean {
  return SET_KIND_RULES[kind][rule];
}

/**
 * Whether a slot continues last session's progression, reps and all: only when the kind it was and the
 * kind it is now both carry over. A drop set's lighter weight is never the next working set's.
 */
export function continuesProgression(last: SetKind, next: SetKind): boolean {
  return setKindHas(last, 'carriesOver') && setKindHas(next, 'carriesOver');
}

/**
 * Whether a slot opens on its weight from last time: when it continues the progression, or when it is
 * the same kind again, so a drop set starts from last week's drop.
 */
export function keepsLastWeight(last: SetKind, next: SetKind): boolean {
  return last === next || continuesProgression(last, next);
}

/** What stands in for a set's number when it isn't a working set. */
export function setKindLetter(kind: LetteredSetKind): SetKindLetter {
  return SET_KIND_RULES[kind].letter;
}

/** Each set's label in order: its letter, or its 1-based number among the working sets. */
export function setLabels(kinds: readonly SetKind[]): string[] {
  let working = 0;
  return kinds.map((kind) => SET_KIND_RULES[kind].letter ?? String(++working));
}
