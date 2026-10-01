import { describe, expect, it } from 'vitest';
import { SessionBlueprint } from '@/models/blueprint-models';
import { parseRoutineColor, routineColorOf } from '@/models/routine-color';

describe('routine colours', () => {
  it('gives routines without a colour the colours in order, by their place', () => {
    expect([0, 1, 2].map((index) => routineColorOf(undefined, index))).toEqual(['vermilion', 'green', 'blue']);
    expect(routineColorOf(undefined, 6)).toBe('vermilion');
    expect(routineColorOf('ochre', 0)).toBe('ochre');
  });

  it('ignores a colour this build does not know', () => {
    expect(parseRoutineColor('teal')).toBeUndefined();
    expect(parseRoutineColor(undefined)).toBeUndefined();
    expect(parseRoutineColor('purple')).toBe('purple');
  });

  it('round-trips through JSON and counts towards equality', () => {
    const push = new SessionBlueprint('Push', [], '');
    const green = push.with({ color: 'green' });

    expect(SessionBlueprint.fromJSON(green.toJSON())).toEqual(green);
    expect(green.equals(push)).toBe(false);
    expect(green.withName('Push day').color).toBe('green');
    expect('color' in push.toJSON()).toBe(false);
    expect(SessionBlueprint.fromJSON({ ...push.toJSON(), color: 'teal' }).color).toBeUndefined();
  });
});
