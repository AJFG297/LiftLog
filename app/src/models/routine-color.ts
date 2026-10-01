import type { HexColor } from '@/utils/color';

/**
 * The colours a routine can be given, in the order routines take them before anyone picks one. Stored by
 * name rather than by hex so the shades can be retuned without touching saved plans. They are the user's
 * choice per routine and never follow the app's accent (plan D2).
 */
export const ROUTINE_COLORS = ['vermilion', 'green', 'blue', 'ochre', 'purple', 'stone'] as const;

export type RoutineColor = (typeof ROUTINE_COLORS)[number];

export const ROUTINE_COLOR_HEX: Record<RoutineColor, HexColor> = {
  vermilion: '#C2451E',
  green: '#2E6B5E',
  blue: '#3C4F9A',
  ochre: '#8A5A12',
  purple: '#6B4F9A',
  stone: '#625E55',
};

/** A stored colour, or undefined for none or for a name this build doesn't know. */
export function parseRoutineColor(value: string | undefined): RoutineColor | undefined {
  return ROUTINE_COLORS.find((color) => color === value);
}

/**
 * The colour a routine shows: its own, or else the one for its place in the program, so a three-day split
 * starts out vermilion, green and blue.
 */
export function routineColorOf(color: RoutineColor | undefined, sessionIndex: number): RoutineColor {
  return color ?? ROUTINE_COLORS[Math.max(0, sessionIndex) % ROUTINE_COLORS.length]!;
}
