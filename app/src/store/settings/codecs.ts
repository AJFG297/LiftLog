import { DayOfWeek, Instant } from '@js-joda/core';
import { match, P } from 'ts-pattern';
import type { PerUnit } from '@/models/weight';
import { PROGRESS_TABS, type ProgressTab } from '@/store/stats/progress-tab';

export type ColorSchemeSeed = 'default' | `#${string}`;

export type ThemeMode = 'system' | 'light' | 'dark';

export type PlansSortOrder = 'name' | 'recent';

// A codec maps between a preference's runtime value and its on-disk string.
// `deserialize` returns undefined when the key is absent or unparseable, so the
// caller falls back to the descriptor default. `serialize` returns undefined to
// signal the key should be removed rather than written.
export interface Codec<T> {
  deserialize(raw: string | undefined): T | undefined;
  serialize(value: T): string | undefined;
}

// Booleans persist as 'True'/'False' - the casing is historical, don't change it.
export const boolCodec: Codec<boolean> = {
  deserialize: (raw) => (raw === undefined ? undefined : raw === 'True'),
  serialize: (value) => (value ? 'True' : 'False'),
};

export const intCodec: Codec<number> = {
  deserialize: (raw) => {
    const parsed = parseInt(raw ?? '', 10);
    return isNaN(parsed) ? undefined : parsed;
  },
  serialize: (value) => value.toString(),
};

export const stringCodec: Codec<string | undefined> = {
  deserialize: (raw) => raw,
  serialize: (value) => value,
};

export const colorSchemeSeedCodec: Codec<ColorSchemeSeed> = {
  deserialize: (raw) =>
    match(raw)
      .returnType<ColorSchemeSeed>()
      .with(P.string.regex(/^#[0-9a-fA-F]{6}$/), (v) => v as ColorSchemeSeed)
      .otherwise(() => 'default'),
  serialize: (value) => value,
};

export const themeModeCodec: Codec<ThemeMode> = {
  deserialize: (raw) =>
    match(raw)
      .with('light', 'dark', 'system', (v) => v)
      .otherwise(() => undefined),
  serialize: (value) => value,
};

export const plansSortOrderCodec: Codec<PlansSortOrder> = {
  deserialize: (raw) =>
    match(raw)
      .with('name', 'recent', (v) => v)
      .otherwise(() => undefined),
  serialize: (value) => value,
};

export const progressTabCodec: Codec<ProgressTab> = {
  deserialize: (raw) => PROGRESS_TABS.find((tab) => tab === raw),
  serialize: (value) => value,
};

export const dayOfWeekCodec: Codec<DayOfWeek> = {
  deserialize: (raw) =>
    match(raw?.toLowerCase())
      .with('sunday', () => DayOfWeek.SUNDAY)
      .with('monday', () => DayOfWeek.MONDAY)
      .with('tuesday', () => DayOfWeek.TUESDAY)
      .with('wednesday', () => DayOfWeek.WEDNESDAY)
      .with('thursday', () => DayOfWeek.THURSDAY)
      .with('friday', () => DayOfWeek.FRIDAY)
      .with('saturday', () => DayOfWeek.SATURDAY)
      .otherwise(() => undefined),
  serialize: (value) => value.name(),
};

/** A value per plate unit, stored as JSON. Anything that isn't a valid value for both units reads as absent. */
export function perUnitCodec<T>(isValue: (value: unknown) => value is T): Codec<PerUnit<T>> {
  return {
    deserialize: (raw) => {
      try {
        const parsed: unknown = JSON.parse(raw ?? '');
        return typeof parsed === 'object' &&
          parsed !== null &&
          'kilograms' in parsed &&
          'pounds' in parsed &&
          isValue(parsed.kilograms) &&
          isValue(parsed.pounds)
          ? { kilograms: parsed.kilograms, pounds: parsed.pounds }
          : undefined;
      } catch {
        return undefined;
      }
    },
    serialize: (value) => JSON.stringify(value),
  };
}

export const isBarWeight = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

export const isPlateList = (value: unknown): value is number[] =>
  Array.isArray(value) && value.every((plate) => typeof plate === 'number' && Number.isFinite(plate) && plate > 0);

export const instantCodec: Codec<Instant> = {
  deserialize: (raw) => {
    if (!raw) return undefined;
    try {
      return Instant.parse(raw);
    } catch {
      return undefined;
    }
  },
  serialize: (value) => value.toString(),
};
