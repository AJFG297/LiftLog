import { TextStyle, ViewStyle } from 'react-native';

const textKeys = ['color', 'textAlign', 'fontSize', 'fontWeight'] as const;

/**
 * Number editors take one `style`, as Paper's field did: its text properties go to the text and the rest to
 * the field's box. Unset keys are left out, since an `undefined` in a style array still overrides the field's
 * own colour.
 */
export function splitTextStyle(style: TextStyle | undefined): { boxStyle: ViewStyle; textStyle: TextStyle } {
  const boxStyle: Record<string, unknown> = { ...style };
  const textStyle: Record<string, unknown> = {};
  for (const key of textKeys) {
    if (boxStyle[key] !== undefined) {
      textStyle[key] = boxStyle[key];
    }
    delete boxStyle[key];
  }
  return { boxStyle: boxStyle as ViewStyle, textStyle: textStyle as TextStyle };
}
