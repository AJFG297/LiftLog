import { describe, expect, it } from 'vitest';
import {
  type Digit,
  type NumberPadAction,
  type NumberPadField,
  numberPadReducer,
  numberPadValue,
  openNumberPad,
} from './number-pad-buffer';

type Key = Digit | '.' | '⌫' | '+' | '-';

function actionFor(key: Key): NumberPadAction {
  switch (key) {
    case '.':
      return { type: 'decimal' };
    case '⌫':
      return { type: 'backspace' };
    case '+':
      return { type: 'step', direction: 'up' };
    case '-':
      return { type: 'step', direction: 'down' };
    default:
      return { type: 'digit', digit: key };
  }
}

function press(field: NumberPadField, ...keys: Key[]) {
  const buffer = keys.map(actionFor).reduce(numberPadReducer, openNumberPad(field));
  return { typed: buffer.typed, value: numberPadValue(buffer)?.toString() };
}

const weight: NumberPadField = { placeholder: 60, allowDecimal: true, step: 2.5 };
const reps: NumberPadField = { placeholder: 8, allowDecimal: false, step: 1 };
const emptyWeight: NumberPadField = { allowDecimal: true, step: 2.5 };

describe('number pad buffer', () => {
  it('opens empty, showing the placeholder', () => {
    expect(press(weight)).toEqual({ typed: null, value: '60' });
    expect(press(emptyWeight)).toEqual({ typed: null, value: undefined });
  });

  it('replaces the placeholder with what is typed', () => {
    expect(press(weight, '8', '5')).toEqual({ typed: '85', value: '85' });
    expect(press(reps, '1', '2')).toEqual({ typed: '12', value: '12' });
  });

  it('removes the last character on backspace, and shows the placeholder again once empty', () => {
    expect(press(weight, '8', '5', '⌫')).toEqual({ typed: '8', value: '8' });
    expect(press(weight, '8', '⌫')).toEqual({ typed: null, value: '60' });
    expect(press(weight, '⌫')).toEqual({ typed: null, value: '60' });
    expect(press(weight, '6', '2', '.', '5', '⌫', '⌫')).toEqual({ typed: '62', value: '62' });
  });

  it('types a decimal once', () => {
    expect(press(weight, '6', '2', '.', '5')).toEqual({ typed: '62.5', value: '62.5' });
    expect(press(weight, '6', '.', '.', '5')).toEqual({ typed: '6.5', value: '6.5' });
    expect(press(weight, '6', '.')).toEqual({ typed: '6.', value: '6' });
  });

  it('starts a leading decimal from zero', () => {
    expect(press(weight, '.', '5')).toEqual({ typed: '0.5', value: '0.5' });
  });

  it('has no decimal for reps', () => {
    expect(press(reps, '1', '.', '2')).toEqual({ typed: '12', value: '12' });
    expect(press(reps, '.')).toEqual({ typed: null, value: '8' });
  });

  it('drops a leading zero', () => {
    expect(press(weight, '0', '5')).toEqual({ typed: '5', value: '5' });
    expect(press(weight, '0', '0')).toEqual({ typed: '0', value: '0' });
  });

  it('stops at four whole digits and two decimals', () => {
    expect(press(weight, '1', '2', '3', '4', '5')).toEqual({ typed: '1234', value: '1234' });
    expect(press(weight, '2', '.', '5', '5', '5')).toEqual({ typed: '2.55', value: '2.55' });
  });

  it('steps from the placeholder when nothing is typed', () => {
    expect(press(weight, '+')).toEqual({ typed: '62.5', value: '62.5' });
    expect(press(weight, '-')).toEqual({ typed: '57.5', value: '57.5' });
    expect(press(reps, '+', '+')).toEqual({ typed: '10', value: '10' });
  });

  it('steps from what was typed', () => {
    expect(press(weight, '7', '0', '+')).toEqual({ typed: '72.5', value: '72.5' });
    expect(press(weight, '7', '.', '-')).toEqual({ typed: '4.5', value: '4.5' });
  });

  it('steps from zero with no placeholder, and never below it', () => {
    expect(press(emptyWeight, '+')).toEqual({ typed: '2.5', value: '2.5' });
    expect(press(emptyWeight, '-')).toEqual({ typed: '0', value: '0' });
    expect(press(weight, '1', '-')).toEqual({ typed: '0', value: '0' });
  });

  it('adds steps without drifting', () => {
    const small: NumberPadField = { placeholder: 0.1, allowDecimal: true, step: 0.2 };
    expect(press(small, '+', '+', '+')).toEqual({ typed: '0.7', value: '0.7' });
    expect(press(weight, '+', '+', '+', '+', '-')).toEqual({ typed: '67.5', value: '67.5' });
  });

  it('opens the next field fresh on reset', () => {
    const typed = [actionFor('9'), actionFor('0')].reduce(numberPadReducer, openNumberPad(weight));
    const next = numberPadReducer(typed, { type: 'reset', field: reps });
    expect({ typed: next.typed, value: numberPadValue(next)?.toString() }).toEqual({ typed: null, value: '8' });
    expect(numberPadReducer(next, actionFor('+')).typed).toBe('9');
  });
});
