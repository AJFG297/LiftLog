import type { TranslationKey } from '@tolgee/web';
import type { ThemeTokens } from '@/utils/theme-tokens';

export type SetBadgeKind = 'working' | 'warmup' | 'drop' | 'myo' | 'failure';

type LetteredKind = Exclude<SetBadgeKind, 'working'>;

/** Only working sets are numbered (1-based, counting working sets only); every other kind shows a letter. */
export type SetBadgeProps = { kind: 'working'; number: number } | { kind: LetteredKind };

type TokenName = keyof ThemeTokens;

interface SetBadgeLook {
  fill: TokenName;
  ink: TokenName;
  /** Drop and myo sets are ringed in the accent so they read as "a variation of a working set". */
  ring?: TokenName;
  spokenLabel: TranslationKey;
}

export const SET_BADGE_LOOK: Record<'working', SetBadgeLook> &
  Record<LetteredKind, SetBadgeLook & { letter: TranslationKey }> = {
  working: { fill: 'bg', ink: 'ink', spokenLabel: 'workout.set_badge.working.label' },
  warmup: {
    fill: 'accentSoft',
    ink: 'accentSoftInk',
    letter: 'workout.warmup_set.badge.label',
    spokenLabel: 'workout.set_badge.warmup.label',
  },
  drop: {
    fill: 'ink',
    ink: 'bg',
    ring: 'accentInk',
    letter: 'workout.drop_set.badge.label',
    spokenLabel: 'workout.set_badge.drop.label',
  },
  myo: {
    fill: 'ink',
    ink: 'bg',
    ring: 'accentInk',
    letter: 'workout.myo_set.badge.label',
    spokenLabel: 'workout.set_badge.myo.label',
  },
  failure: {
    fill: 'failure',
    ink: 'onFailure',
    letter: 'workout.failure_set.badge.label',
    spokenLabel: 'workout.set_badge.failure.label',
  },
};

type Translate = (key: TranslationKey, params?: Record<string, number>) => string;

export function setBadgeText(badge: SetBadgeProps, t: Translate): { text: string; accessibilityLabel: string } {
  if (badge.kind === 'working') {
    const look = SET_BADGE_LOOK.working;
    return { text: String(badge.number), accessibilityLabel: t(look.spokenLabel, { number: badge.number }) };
  }
  const look = SET_BADGE_LOOK[badge.kind];
  return { text: t(look.letter), accessibilityLabel: t(look.spokenLabel) };
}
