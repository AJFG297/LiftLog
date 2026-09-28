import BigNumber from 'bignumber.js';

export type Digit = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9';

export interface NumberPadField {
  placeholder?: BigNumber.Value;
  allowDecimal: boolean;
  step: BigNumber.Value;
}

export interface NumberPadBuffer {
  /** `null` while the field still shows its placeholder. The decimal separator is always `.`. */
  typed: string | null;
  placeholder: BigNumber | undefined;
  allowDecimal: boolean;
  step: BigNumber;
}

export type NumberPadAction =
  | { type: 'digit'; digit: Digit }
  | { type: 'decimal' }
  | { type: 'backspace' }
  | { type: 'step'; direction: 'up' | 'down' }
  | { type: 'reset'; field: NumberPadField };

const MAX_WHOLE_DIGITS = 4;
const MAX_DECIMAL_DIGITS = 2;

export function openNumberPad(field: NumberPadField): NumberPadBuffer {
  return {
    typed: null,
    placeholder: field.placeholder === undefined ? undefined : new BigNumber(field.placeholder),
    allowDecimal: field.allowDecimal,
    step: new BigNumber(field.step),
  };
}

export function numberPadReducer(state: NumberPadBuffer, action: NumberPadAction): NumberPadBuffer {
  switch (action.type) {
    case 'digit':
      return withTyped(state, appendDigit(state.typed ?? '', action.digit));
    case 'decimal':
      if (!state.allowDecimal || state.typed?.includes('.')) {
        return state;
      }
      return withTyped(state, `${state.typed || '0'}.`);
    case 'backspace':
      return withTyped(state, state.typed?.slice(0, -1) || null);
    case 'step': {
      const from = numberPadValue(state) ?? new BigNumber(0);
      const moved = action.direction === 'up' ? from.plus(state.step) : from.minus(state.step);
      return withTyped(state, BigNumber.max(moved, 0).toFixed());
    }
    case 'reset':
      return openNumberPad(action.field);
  }
}

export function numberPadValue(state: NumberPadBuffer): BigNumber | undefined {
  return state.typed === null ? state.placeholder : new BigNumber(state.typed);
}

function appendDigit(typed: string, digit: Digit): string {
  if (typed === '0') {
    return digit;
  }
  const [whole = '', decimals] = typed.split('.');
  const full = decimals === undefined ? whole.length >= MAX_WHOLE_DIGITS : decimals.length >= MAX_DECIMAL_DIGITS;
  return full ? typed : typed + digit;
}

function withTyped(state: NumberPadBuffer, typed: string | null): NumberPadBuffer {
  return typed === state.typed ? state : { ...state, typed };
}
