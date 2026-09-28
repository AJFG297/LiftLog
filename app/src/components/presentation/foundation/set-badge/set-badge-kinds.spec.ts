import { describe, expect, it } from 'vitest';
import type { TranslationKey } from '@tolgee/web';
import en from '@/i18n/en.json';
import { SET_BADGE_LOOK, setBadgeText } from '@/components/presentation/foundation/set-badge/set-badge-kinds';
import type { SetKind } from '@/models/session-models/set-kind';
import { ACCENT_PRESETS, contrastRatio, themeTokens, type ThemeVariant } from '@/utils/theme-tokens';

const strings: Record<TranslationKey, string> = en;
const t = (key: TranslationKey, params: Record<string, number> = {}) =>
  strings[key].replace(/\{(\w+)\}/g, (_, name: string) => String(params[name]));

describe('setBadgeText', () => {
  it('numbers a working set and reads it out as "Set n"', () => {
    expect(setBadgeText({ kind: 'working', number: 3 }, t)).toEqual({ text: '3', accessibilityLabel: 'Set 3' });
  });

  it.each([
    ['warmup', 'W', 'Warm-up set'],
    ['drop', 'D', 'Drop set'],
    ['myo', 'M', 'Myo-reps set'],
    ['failure', 'F', 'Set to failure'],
  ] as const)('shows %s sets as a letter with a spoken name', (kind, text, accessibilityLabel) => {
    expect(setBadgeText({ kind }, t)).toEqual({ text, accessibilityLabel });
  });
});

describe('SET_BADGE_LOOK', () => {
  const kinds = Object.keys(SET_BADGE_LOOK) as SetKind[];
  const variants: ThemeVariant[] = ['light', 'dark', 'trueBlack'];

  it('keeps every badge letter legible on its fill, for every accent and variant', () => {
    for (const { seed } of ACCENT_PRESETS) {
      for (const variant of variants) {
        const tokens = themeTokens(seed, variant);
        for (const kind of kinds) {
          const { fill, ink } = SET_BADGE_LOOK[kind];
          expect(contrastRatio(tokens[ink], tokens[fill]), `${kind} in ${variant} on ${seed}`).toBeGreaterThanOrEqual(
            4.5,
          );
        }
      }
    }
  });

  it('rings warm-up, drop and myo badges in the accent, so they stand out from the tile under them', () => {
    const ringed = (Object.keys(SET_BADGE_LOOK) as SetKind[]).filter(
      (kind) => SET_BADGE_LOOK[kind].ring === 'accentInk',
    );
    expect(ringed).toEqual(['warmup', 'drop', 'myo']);
  });

  it('draws failure sets in the failure red, whatever the accent', () => {
    const tokens = themeTokens('#2F5BD3', 'dark');
    const { fill, ink } = SET_BADGE_LOOK.failure;
    expect([tokens[fill], tokens[ink]]).toEqual(['#C62828', '#FFFFFF']);
  });
});
