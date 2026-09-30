import type { HexColor } from '@/utils/color';
import { accentFill } from '@/utils/theme-tokens';

/**
 * Colours that tell workouts apart on Home: the day circles, the calendar and the bar on each history
 * card. They are fills with white numbers on them, so each is run through `accentFill`, which keeps white
 * text on it legible. They never follow the user's accent (plan D2).
 */
export const ROUTINE_COLORS: readonly HexColor[] = (
  ['#C2451E', '#2E6B5E', '#3C4F9A', '#6D4AD8', '#A86A00', '#C2366B', '#0F7A7A'] as const
).map(accentFill);

/**
 * A workout's colour. Workouts of the active plan take the colours in plan order, so a three-day split
 * is always the first three. Anything else (an older plan, a freeform workout) is coloured by its name,
 * so the same name keeps the same colour. Nothing is stored: routines have no colour of their own yet.
 */
export function routineColorOf(workoutName: string, planWorkoutNames: readonly string[]): HexColor {
  const planIndex = planWorkoutNames.indexOf(workoutName);
  const index = planIndex >= 0 ? planIndex : hashOf(workoutName);
  return ROUTINE_COLORS[index % ROUTINE_COLORS.length]!;
}

function hashOf(text: string): number {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return hash;
}
