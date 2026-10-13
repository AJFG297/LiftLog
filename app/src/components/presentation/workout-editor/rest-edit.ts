import type { TranslateFn } from '@/i18n/translate-fn';
import { failedSetRestOf, Rest } from '@/models/blueprint-models';
import { durationOfRestPick, RestPick, restPickOf, restWithPick } from '@/models/rest-default';
import { formatTimeSpan } from '@/utils/format-time-span';
import { Duration } from '@js-joda/core';

/** The edit exercise sheet's Rest row: the rest, with the failed-set rest under it. */
export function restRowOf(t: TranslateFn, rest: Rest): { value: string; subtitle: string } {
  return {
    value: formatTimeSpan(rest.rest),
    subtitle: rest.failedSetRest
      ? t('exercise_editor.rest.failure.label', { rest: formatTimeSpan(rest.failedSetRest) })
      : t('exercise_editor.rest.failure_same.label'),
  };
}

/** The routine editor card's Rest row: the rest, and the failed-set rest only when it differs. */
export function routineRestRowOf(
  t: TranslateFn,
  rest: Rest,
): { value: string; note: string | undefined; accessibilityLabel: string } {
  const value = formatTimeSpan(rest.rest);
  const note = rest.failedSetRest
    ? t('exercise_editor.rest_sheet.failed_set.on.label', { rest: formatTimeSpan(rest.failedSetRest) })
    : undefined;
  const label = t('routine_editor.rest.row.label', { rest: value });
  return { value, note, accessibilityLabel: note ? `${label}, ${note}` : label };
}

/** What the rest sheet's wheels and switch show while it is open. */
export interface RestDraft {
  rest: RestPick;
  /** "Different rest after a failed set". Off, a failed set rests the same as any other. */
  failedSetOn: boolean;
  failedSet: RestPick;
}

export function restDraftOf(rest: Rest): RestDraft {
  return {
    rest: restPickOf(rest.rest),
    failedSetOn: rest.failedSetRest !== undefined,
    failedSet: restPickOf(failedSetRestOf(rest)),
  };
}

/** How far past the rest the failed-set wheels start when the switch is turned on. */
const FAILED_SET_HEAD_START = Duration.ofMinutes(1);

/**
 * The switch flipped. Turned on for an exercise without a failed-set rest, its wheels start a minute past the
 * rest, since a different rest after a failure is nearly always a longer one.
 */
export function withFailedSetRestOn(draft: RestDraft, on: boolean): RestDraft {
  const same = draft.failedSet.minutes === draft.rest.minutes && draft.failedSet.seconds === draft.rest.seconds;
  const failedSet =
    on && same ? restPickOf(durationOfRestPick(draft.rest).plus(FAILED_SET_HEAD_START)) : draft.failedSet;
  return { ...draft, failedSetOn: on, failedSet };
}

/**
 * The rest the sheet saves, starting from the exercise's `before`. A wheel left where it opened keeps the
 * rest it showed, so saving doesn't round 2:22 to 2:20. A failed-set rest equal to the rest is the same rest,
 * so it follows the rest from then on.
 */
export function restOfDraft(draft: RestDraft, before: Rest): Rest {
  const rest = restWithPick(before, draft.rest).rest;
  if (!draft.failedSetOn) {
    return { rest };
  }
  const opened = restPickOf(failedSetRestOf(before));
  const untouched = opened.minutes === draft.failedSet.minutes && opened.seconds === draft.failedSet.seconds;
  const failedSetRest = untouched ? failedSetRestOf(before) : durationOfRestPick(draft.failedSet);
  return failedSetRest.equals(rest) ? { rest } : { rest, failedSetRest };
}

/** The line under the failed-set switch. */
export function failedSetHintOf(t: TranslateFn, rest: Rest): string {
  return rest.failedSetRest
    ? t('exercise_editor.rest_sheet.failed_set.on.label', { rest: formatTimeSpan(rest.failedSetRest) })
    : t('exercise_editor.rest_sheet.failed_set.off.label', { rest: formatTimeSpan(rest.rest) });
}

export function restSaveLabelOf(t: TranslateFn, rest: Rest): string {
  return rest.failedSetRest
    ? t('exercise_editor.rest_sheet.save_with_failure.button', {
        rest: formatTimeSpan(rest.rest),
        failure: formatTimeSpan(rest.failedSetRest),
      })
    : t('exercise_editor.rest_sheet.save.button', { rest: formatTimeSpan(rest.rest) });
}
