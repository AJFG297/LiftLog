import type { TranslationKey } from '@tolgee/web';
import { type LetteredSetKind, type SetKind, setKindLetter } from '@/models/session-models/set-kind';
import type { ThemeTokens } from '@/utils/theme-tokens';

/** Only working sets are numbered (1-based, counting working sets only); every other kind shows a letter. */
export type SetBadgeProps = { kind: 'working'; number: number } | { kind: LetteredSetKind };

type TokenName = keyof ThemeTokens;

interface SetBadgeLook {
  fill: TokenName;
  ink: TokenName;
  /**
   * An accent ring around the fill. Warm-ups have one because their soft fill is close to a tile's own colour;
   * drop and myo have one so they read as a variation of a working set.
   */
  ring?: TokenName;
  spokenLabel: TranslationKey;
}

export const SET_BADGE_LOOK: Record<SetKind, SetBadgeLook> = {
  working: { fill: 'bg', ink: 'ink', spokenLabel: 'workout.set_badge.working.label' },
  warmup: {
    fill: 'accentSoft',
    ink: 'accentSoftInk',
    ring: 'accentInk',
    spokenLabel: 'workout.set_badge.warmup.label',
  },
  drop: {
    fill: 'ink',
    ink: 'bg',
    ring: 'accentInk',
    spokenLabel: 'workout.set_badge.drop.label',
  },
  myo: {
    fill: 'ink',
    ink: 'bg',
    ring: 'accentInk',
    spokenLabel: 'workout.set_badge.myo.label',
  },
  failure: {
    fill: 'failure',
    ink: 'onFailure',
    spokenLabel: 'workout.set_badge.failure.label',
  },
};

type Translate = (key: TranslationKey, params?: Record<string, number>) => string;

export function setBadgeText(badge: SetBadgeProps, t: Translate): { text: string; accessibilityLabel: string } {
  if (badge.kind === 'working') {
    const look = SET_BADGE_LOOK.working;
    return { text: String(badge.number), accessibilityLabel: t(look.spokenLabel, { number: badge.number }) };
  }
  return { text: setKindLetter(badge.kind), accessibilityLabel: t(SET_BADGE_LOOK[badge.kind].spokenLabel) };
}
