import { describe, expect, it } from 'vitest';
import { UseTranslateResult } from '@tolgee/react';
import { Duration } from '@js-joda/core';
import en from '@/i18n/en.json';
import { Rest } from '@/models/blueprint-models';
import {
  failedSetHintOf,
  restOfDraft,
  restDraftOf,
  restRowOf,
  restSaveLabelOf,
  withFailedSetRestOn,
} from '@/components/presentation/workout-editor/rest-edit';

/** The English strings with their placeholders filled, the way Tolgee's simple formatter does it. */
const t = ((key: string, params?: Record<string, string | number>) =>
  (en as Record<string, string>)[key]!.replace(/\{(\w+)\}/g, (_, name: string) =>
    String(params?.[name]),
  )) as UseTranslateResult['t'];

const s = (seconds: number) => Duration.ofSeconds(seconds);
const same: Rest = { rest: s(120) };
const longer: Rest = { rest: s(120), failedSetRest: s(180) };
const seconds = (rest: Rest) => ({ rest: rest.rest.seconds(), failedSetRest: rest.failedSetRest?.seconds() });

describe('restRowOf', () => {
  it('shows the rest, and the failed-set rest as the same or its own time', () => {
    expect(restRowOf(t, same)).toEqual({ value: '2:00', subtitle: 'After a failed set: same' });
    expect(restRowOf(t, longer)).toEqual({ value: '2:00', subtitle: 'After a failed set: 3:00' });
  });
});

describe('the rest sheet', () => {
  it('opens on the rest, with the failed-set switch off when it is the same', () => {
    expect(restDraftOf(same)).toEqual({
      rest: { minutes: 2, seconds: 0 },
      failedSetOn: false,
      failedSet: { minutes: 2, seconds: 0 },
    });
    expect(restDraftOf(longer)).toMatchObject({ failedSetOn: true, failedSet: { minutes: 3, seconds: 0 } });
  });

  it('saves the picked rest, and a failed set the same as it while the switch is off', () => {
    const draft = { ...restDraftOf(same), rest: { minutes: 2, seconds: 30 } };
    expect(seconds(restOfDraft(draft, same))).toEqual({ rest: 150, failedSetRest: undefined });
  });

  it('turning the switch on starts the failed-set wheels a minute past the rest', () => {
    const on = withFailedSetRestOn(restDraftOf(same), true);
    expect(on).toMatchObject({ failedSetOn: true, failedSet: { minutes: 3, seconds: 0 } });
    expect(seconds(restOfDraft(on, same))).toEqual({ rest: 120, failedSetRest: 180 });
  });

  it('turning the switch off returns the failed set to the same as the rest', () => {
    const off = withFailedSetRestOn(restDraftOf(longer), false);
    expect(seconds(restOfDraft(off, longer))).toEqual({ rest: 120, failedSetRest: undefined });
  });

  it('saves a failed-set rest picked equal to the rest as the same', () => {
    const draft = { ...restDraftOf(longer), failedSet: { minutes: 2, seconds: 0 } };
    expect(seconds(restOfDraft(draft, longer))).toEqual({ rest: 120, failedSetRest: undefined });
  });

  it('keeps rests the wheels cannot show when saved untouched', () => {
    const odd: Rest = { rest: s(142), failedSetRest: s(203) };
    expect(seconds(restOfDraft(restDraftOf(odd), odd))).toEqual({ rest: 142, failedSetRest: 203 });
  });
});

describe('the rest sheet copy', () => {
  it('says what the failed-set switch means', () => {
    expect(failedSetHintOf(t, same)).toBe('Off: same as rest (2:00)');
    expect(failedSetHintOf(t, longer)).toBe('3:00 after a failed set');
  });

  it('names what saving saves', () => {
    expect(restSaveLabelOf(t, same)).toBe('Save 2:00');
    expect(restSaveLabelOf(t, longer)).toBe('Save 2:00 · 3:00 after a failure');
  });
});
