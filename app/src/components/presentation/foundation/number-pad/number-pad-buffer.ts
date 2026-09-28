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
  /** Set by ±, so the next digit or decimal starts a new value, as it does over the placeholder. */
  stepped: boolean;
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
    stepped: false,
    placeholder: field.placeholder === undefined ? undefined : new BigNumber(field.placeholder),
    allowDecimal: field.allowDecimal,
    step: new BigNumber(field.step),
  };
}

export function numberPadReducer(state: NumberPadBuffer, action: NumberPadAction): NumberPadBuffer {
  switch (action.type) {
    case 'digit':
      return withTyped(state, appendDigit(editable(state), action.digit));
    case 'decimal': {
      const typed = editable(state);
      if (!state.allowDecimal || typed.includes('.')) {
        return state;
      }
      return withTyped(state, `${typed || '0'}.`);
    }
    case 'backspace': {
      const typed = state.typed?.slice(0, -1) ?? '';
      // Only a leading decimal leaves a lone 0 to delete back to, and that 0 wasn't typed.
      return withTyped(state, typed === '' || typed === '0' ? null : typed);
    }
    case 'step': {
      const decimals = state.allowDecimal ? MAX_DECIMAL_DIGITS : 0;
      const largest = new BigNumber(10).pow(MAX_WHOLE_DIGITS).minus(new BigNumber(10).pow(-decimals));
      const from = numberPadValue(state) ?? new BigNumber(0);
      const moved = action.direction === 'up' ? from.plus(state.step) : from.minus(state.step);
      const typed = BigNumber.min(BigNumber.max(moved.decimalPlaces(decimals), 0), largest).toFixed();
      return typed === state.typed && state.stepped ? state : { ...state, typed, stepped: true };
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

/** What typing edits: nothing over the placeholder or a stepped value, which it replaces. */
function editable(state: NumberPadBuffer): string {
  return state.stepped ? '' : (state.typed ?? '');
}

function withTyped(state: NumberPadBuffer, typed: string | null): NumberPadBuffer {
  return typed === state.typed && !state.stepped ? state : { ...state, typed, stepped: false };
}
