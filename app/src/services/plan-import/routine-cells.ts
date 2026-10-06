import type { RepsConfig, RepsTarget } from '@/models/blueprint-models';
import { Duration } from '@js-joda/core';

/*
 * The grammar of one cell in a routine table. Each parser returns undefined for a cell it cannot read,
 * and the caller falls back to the app's defaults, so a stray cell never stops an import.
 */

/** More sets than this is not a set count; it is usually a weight or reps typed in the wrong column. */
const MAX_SETS = 20;
const MAX_REPS = 100;

function normalize(cell: string): string {
  return cell
    .trim()
    .toLowerCase()
    .replace(/[\u2012-\u2015\u2212]/g, '-')
    .replace(/\u00d7/g, 'x')
    .replace(/\s+/g, ' ');
}

export function parseSetsCell(cell: string): number | undefined {
  const sets = Number(normalize(cell).match(/^(\d+)(?:\s*sets?)?$/)?.[1]);
  return sets >= 1 ? Math.min(sets, MAX_SETS) : undefined;
}

export interface ParsedReps {
  reps: RepsConfig;
  /** How many sets the cell spells out, for a per-set list like `12, 10, 8`. */
  sets?: number;
  /** False when the cell said more than a rep target can hold (`8+`, `10 each side`), so it is worth keeping as a note. */
  exact: boolean;
}

function target(min: number, max = min): RepsTarget | undefined {
  const [low, high] = min <= max ? [min, max] : [max, min];
  return low >= 1 && high <= MAX_REPS ? { min: low, max: high } : undefined;
}

const SINGLE_TARGET = /^(\d+)(?:\s*(?:-|to)\s*(\d+))?$/;

function parseTarget(text: string): RepsTarget | undefined {
  const m = text.trim().match(SINGLE_TARGET);
  return m ? target(Number(m[1]), m[2] === undefined ? undefined : Number(m[2])) : undefined;
}

/**
 * `8`, `8-12` (any dash, or `8 to 12`) and a per-set list `12, 10, 8` or `12/10/8` are read exactly. A
 * cell that only starts with a target, such as `8+` or `10 each side`, reads as that target and is marked
 * inexact. `AMRAP` and other words read as nothing.
 */
export function parseRepsCell(cell: string): ParsedReps | undefined {
  const text = normalize(cell).replace(/\s*reps?$/, '');
  if (!text) {
    return undefined;
  }
  const single = parseTarget(text);
  if (single) {
    return {
      reps: single.min === single.max ? { type: 'fixed', reps: single.min } : { type: 'range', ...single },
      exact: true,
    };
  }
  const parts = text.split(/\s*[,/;]\s*/);
  if (parts.length > 1) {
    const targets = parts.map(parseTarget);
    if (targets.every((t) => t !== undefined)) {
      return { reps: { type: 'perSet', targets }, sets: targets.length, exact: true };
    }
  }
  const leading = text.match(/^(\d+)(?:\s*(?:-|to)\s*(\d+))?/);
  const fallback = leading && target(Number(leading[1]), leading[2] === undefined ? undefined : Number(leading[2]));
  if (fallback) {
    return {
      reps: fallback.min === fallback.max ? { type: 'fixed', reps: fallback.min } : { type: 'range', ...fallback },
      exact: false,
    };
  }
  return undefined;
}

/** `3x8`, `3 x 8-12`, `3×8`, `5X5`, `3*10` or `3 sets of 8`. The reps part follows {@link parseRepsCell}. */
export function parseSetsXRepsCell(cell: string): (ParsedReps & { sets: number }) | undefined {
  const m = normalize(cell).match(/^(\d+)\s*(?:sets?\s*)?(?:x|\*|of)\s*(.+)$/);
  const sets = m && parseSetsCell(m[1]!);
  const reps = m && parseRepsCell(m[2]!);
  return sets && reps ? { ...reps, sets } : undefined;
}

/** What a bare number in a rest column means, taken from the header (`Rest (min)`, `Rest (sec)`). */
export type RestUnitHint = 'minutes' | 'seconds' | undefined;

const SECOND_UNITS = /^(?:s|sec|secs|second|seconds|")$/;
const MINUTE_UNITS = /^(?:m|min|mins|minute|minutes|')$/;

/**
 * `90`, `90s`, `2 min`, `1:30`, `1m30s`, and a range such as `2-3 min` (its lower end). A bare number
 * follows the header's unit; with none, under 10 is minutes and anything else seconds. A fraction of 1
 * is a time the spreadsheet stored for a typed `1:30`, which it took as hours and minutes.
 */
export function parseRestCell(cell: string, hint?: RestUnitHint): Duration | undefined {
  const text = normalize(cell);
  const clock = text.match(/^(\d+):(\d{1,2})$/);
  if (clock) {
    return Duration.ofSeconds(Number(clock[1]) * 60 + Number(clock[2]));
  }
  const compound = text.match(/^(\d+)\s*m(?:in(?:ute)?s?)?\s*(\d+)\s*s(?:ec(?:ond)?s?)?$/);
  if (compound) {
    return Duration.ofSeconds(Number(compound[1]) * 60 + Number(compound[2]));
  }
  const m = text.match(/^(\d+(?:\.\d+)?)(?:\s*(?:-|to)\s*\d+(?:\.\d+)?)?\s*(\S*)$/);
  if (!m) {
    return undefined;
  }
  const value = Number(m[1]);
  const unit = m[2] ?? '';
  if (SECOND_UNITS.test(unit)) {
    return Duration.ofSeconds(Math.round(value));
  }
  if (MINUTE_UNITS.test(unit)) {
    return Duration.ofSeconds(Math.round(value * 60));
  }
  if (unit) {
    return undefined;
  }
  if (value > 0 && value < 1 && !hint) {
    const asMinutesAndSeconds = Math.round(value * 24 * 60);
    return Duration.ofSeconds(asMinutesAndSeconds >= 10 ? asMinutesAndSeconds : Math.round(value * 24 * 60 * 60));
  }
  const minutes = hint ? hint === 'minutes' : value < 10;
  return Duration.ofSeconds(Math.round(minutes ? value * 60 : value));
}
