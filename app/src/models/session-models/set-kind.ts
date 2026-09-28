/** What a set is for. Everything a kind changes is in {@link SET_KIND_RULES}. */
export type SetKind = 'working' | 'warmup' | 'drop' | 'myo' | 'failure';

/**
 * The kinds a planned or working-list set can be. Warm-ups have their own list, in the plan and in the
 * session, because they are planned differently (a share of the top set, or a fixed weight).
 */
export type WorkingListKind = Exclude<SetKind, 'warmup'>;

/** Which of an exercise's two set lists a slot lives in. */
export type SetList = 'warmup' | 'working';

export type SetKindLetter = 'W' | 'D' | 'M' | 'F';

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
  letter: SetKindLetter | null;
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

export type SetKindRule = Exclude<keyof SetKindRules, 'letter'>;

export function setKindCounts(kind: SetKind, rule: SetKindRule): boolean {
  return SET_KIND_RULES[kind][rule];
}

/** A working set's 1-based number among the working sets, or the letter for any other kind. */
export function setLabel(kind: LetteredSetKind): SetKindLetter;
export function setLabel(kind: SetKind, workingNumber: number): string;
export function setLabel(kind: SetKind, workingNumber?: number): string {
  return SET_KIND_RULES[kind].letter ?? `${workingNumber}`;
}

/** {@link setLabel} for a whole list in order, numbering only its working sets. */
export function setLabels(kinds: readonly SetKind[]): string[] {
  let working = 0;
  return kinds.map((kind) => setLabel(kind, SET_KIND_RULES[kind].letter === null ? ++working : working));
}
