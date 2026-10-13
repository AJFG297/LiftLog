import { describe, expect, it } from 'vitest';
import { Duration } from '@js-joda/core';
import { failedSetRestOf, Rest, restEquals } from '@/models/blueprint-models';
import type { RestJSON } from '@/models/storage/versions/latest';
import { toDurationJSON } from '@/models/storage/versions/libs';

const s = (seconds: number) => Duration.ofSeconds(seconds);
const triple = (min: number, max: number, failure: number): RestJSON => ({
  minRest: toDurationJSON(s(min)),
  maxRest: toDurationJSON(s(max)),
  failureRest: toDurationJSON(s(failure)),
});
const read = (json: RestJSON) => {
  const rest = Rest.fromJSON(json);
  return { rest: rest.rest.seconds(), failedSetRest: rest.failedSetRest?.seconds() };
};

describe('Rest.fromJSON reading the old three-field rest', () => {
  it.each([
    ['short', 60, 90, 180],
    ['medium', 90, 180, 300],
    ['long', 180, 300, 480],
  ])('reads the old %s preset as the rest, the same after a failed set', (_, min, max, failure) => {
    expect(read(triple(min, max, failure))).toEqual({ rest: min, failedSetRest: undefined });
  });

  it('reads a failure rest equal to the rest as the same', () => {
    expect(read(triple(120, 180, 120))).toEqual({ rest: 120, failedSetRest: undefined });
  });

  it('keeps a custom failure rest as the rest after a failed set', () => {
    expect(read(triple(120, 150, 240))).toEqual({ rest: 120, failedSetRest: 240 });
    // A preset's failure rest with a rest of the lifter's own is still a choice of theirs.
    expect(read(triple(120, 180, 300))).toEqual({ rest: 120, failedSetRest: 300 });
  });

  it('has no max rest any more', () => {
    expect(Object.keys(Rest.fromJSON(triple(60, 90, 180)))).not.toContain('maxRest');
  });
});

describe('Rest.toJSON', () => {
  it('writes the max rest as the rest and the failure rest resolved, so older versions read the same rest', () => {
    expect(Rest.toJSON({ rest: s(120) })).toEqual(triple(120, 120, 120));
    expect(Rest.toJSON({ rest: s(120), failedSetRest: s(240) })).toEqual(triple(120, 120, 240));
  });

  it('reads back what it wrote', () => {
    const rests: Rest[] = [
      { rest: s(60) },
      { rest: s(90), failedSetRest: s(300) },
      { rest: s(180), failedSetRest: s(300) },
      { rest: s(60), failedSetRest: s(180) },
    ];
    for (const rest of rests) {
      expect(restEquals(Rest.fromJSON(Rest.toJSON(rest)), rest)).toBe(true);
    }
  });
});

describe('failedSetRestOf', () => {
  it('is the failed-set rest when set, otherwise the rest', () => {
    expect(failedSetRestOf({ rest: s(120) }).seconds()).toBe(120);
    expect(failedSetRestOf({ rest: s(120), failedSetRest: s(200) }).seconds()).toBe(200);
  });
});

describe('restEquals', () => {
  it('treats a failed-set rest equal to the rest as the same rest', () => {
    expect(restEquals({ rest: s(120) }, { rest: s(120), failedSetRest: s(120) })).toBe(true);
    expect(restEquals({ rest: s(120) }, { rest: s(120), failedSetRest: s(150) })).toBe(false);
    expect(restEquals({ rest: s(120) }, { rest: s(90) })).toBe(false);
  });
});
