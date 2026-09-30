import { RestPill, RestProgressLine } from '@/components/presentation/live-workout/rest-pill';
import { useLiveWorkoutFocus } from '@/hooks/useLiveWorkoutFocus';
import { Session } from '@/models/session-models';
import { nextExerciseInGroup } from '@/models/session-models/exercise-groups';
import { exerciseRestOf, restOwnerIndexOf, restWindowOf } from '@/models/session-models/rest';
import { NextSetLabel, RestUpNext, restUpNextOf } from '@/models/session-models/rest-up-next';
import { useAppSelector } from '@/store';
import { useTranslate } from '@tolgee/react';
import type { TranslationKey } from '@tolgee/web';
import { useRouter } from 'expo-router';

type TranslateFn = ReturnType<typeof useTranslate>['t'];

/**
 * What the rest pill and the rest sheet show, from the session and the page on screen. With rest timers
 * turned off in the settings, nothing runs and the pill is hidden.
 */
export function useLiveRest(session: Session) {
  const enabled = useAppSelector((x) => x.settings.restTimersEnabled);
  const { groups, focusedGroupIndex, focusedGroup } = useLiveWorkoutFocus(session);
  // The exercise whose set is next on the page, whose rest an idle pill shows.
  const currentIndex = focusedGroup
    ? (nextExerciseInGroup(session, focusedGroup) ?? focusedGroup.indices[0])
    : undefined;
  return {
    enabled,
    window: enabled ? restWindowOf(session) : undefined,
    idleRest: exerciseRestOf(currentIndex === undefined ? undefined : session.recordedExercises[currentIndex]),
    upNext: restUpNextOf(session, groups, focusedGroupIndex),
    ownerIndex: restOwnerIndexOf(session, currentIndex),
  };
}

const NEXT_SET_KEYS: Record<NextSetLabel['kind'], { alone: TranslationKey; inline: TranslationKey }> = {
  working: { alone: 'rest.next_set.working.label', inline: 'rest.next_set_inline.working.label' },
  warmup: { alone: 'rest.next_set.warmup.label', inline: 'rest.next_set_inline.warmup.label' },
  drop: { alone: 'rest.next_set.drop.label', inline: 'rest.next_set_inline.drop.label' },
  myo: { alone: 'rest.next_set.myo.label', inline: 'rest.next_set_inline.myo.label' },
  failure: { alone: 'rest.next_set.failure.label', inline: 'rest.next_set_inline.failure.label' },
};

/** "Set 3" on its own (the pill's Go), or "set 3" inside a sentence (the sheet's Up next). */
function nextSetText(t: TranslateFn, set: NextSetLabel, form: 'alone' | 'inline'): string {
  const key = NEXT_SET_KEYS[set.kind][form];
  return set.kind === 'working' ? t(key, { number: set.number }) : t(key);
}

/** The pill's "Go · …": the next set on the page, or just Next once the page is done. */
export function goSetText(t: TranslateFn, upNext: RestUpNext): string {
  return upNext.kind === 'set' ? nextSetText(t, upNext.set, 'alone') : t('rest.next_set.next.label');
}

/** "Up next: Bench Press, set 3". */
export function upNextText(t: TranslateFn, upNext: RestUpNext): string {
  switch (upNext.kind) {
    case 'set':
      return t('rest_sheet.up_next_set.subtitle', {
        name: upNext.exerciseName,
        set: nextSetText(t, upNext.set, 'inline'),
      });
    case 'page':
      return t('rest_sheet.up_next_page.subtitle', { names: upNext.exerciseNames.join(' + ') });
    case 'finish':
      return t('rest_sheet.up_next_finish.subtitle');
  }
}

/** The header's rest pill; opens the rest sheet. */
export function LiveRestPill({ session }: { session: Session }) {
  const { t } = useTranslate();
  const { push } = useRouter();
  const rest = useLiveRest(session);
  if (!rest.enabled) {
    return null;
  }
  return (
    <RestPill
      window={rest.window}
      idleRest={rest.idleRest}
      nextSet={goSetText(t, rest.upNext)}
      onPress={() => push('/session/rest')}
    />
  );
}

export function LiveRestProgressLine({ session }: { session: Session }) {
  const rest = useLiveRest(session);
  return <RestProgressLine window={rest.window} />;
}
