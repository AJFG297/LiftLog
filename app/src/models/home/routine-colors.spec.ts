import { describe, expect, it } from 'vitest';
import { ROUTINE_COLORS, routineColorOf } from '@/models/home/routine-colors';
import { contrastRatio, MIN_TEXT_CONTRAST } from '@/utils/theme-tokens';

describe('routine colours', () => {
  it('keep white day numbers legible on every colour', () => {
    for (const color of ROUTINE_COLORS) {
      expect(contrastRatio(color, '#FFFFFF')).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
    }
  });

  it('go to the active plan in order', () => {
    const plan = ['Push', 'Pull', 'Legs'];

    expect(['Push', 'Pull', 'Legs'].map((name) => routineColorOf(name, plan))).toEqual(ROUTINE_COLORS.slice(0, 3));
  });

  it('wrap round a plan longer than the palette', () => {
    const plan = Array.from({ length: ROUTINE_COLORS.length + 1 }, (_, index) => `Day ${index + 1}`);

    expect(routineColorOf(`Day ${ROUTINE_COLORS.length + 1}`, plan)).toBe(ROUTINE_COLORS[0]);
  });

  it('give a workout outside the plan the same colour every time', () => {
    expect(routineColorOf('Freeform Workout', ['Push'])).toBe(routineColorOf('Freeform Workout', []));
    expect(ROUTINE_COLORS).toContain(routineColorOf('Freeform Workout', []));
  });
});
