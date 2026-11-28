import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { MIN_TOUCH_TARGET } from '@/components/presentation/foundation/touch-target';
import { fontFamily, spacing, useAppTheme } from '@/hooks/useAppTheme';
import { ReactNode, Ref, useState } from 'react';
import { StyleProp, TextInput, TextInputProps, TextStyle, View, ViewStyle } from 'react-native';

export type TextFieldProps = Omit<TextInputProps, 'style'> & {
  /** Shown above the field, and read out as its name when there is no `accessibilityLabel`. */
  label?: ReactNode;
  /** Outlines the field in the danger colour. */
  error?: boolean;
  /** Sits inside the field after the text: a unit, a button. */
  right?: ReactNode;
  disabled?: boolean;
  /** Styles the field's box. */
  style?: StyleProp<ViewStyle>;
  /** Styles the text itself. */
  contentStyle?: StyleProp<TextStyle>;
  ref?: Ref<TextInput>;
};

/** A labelled text field drawn from the theme tokens. */
export function TextField({
  label,
  error,
  right,
  disabled,
  style,
  contentStyle,
  multiline,
  onFocus,
  onBlur,
  accessibilityLabel,
  ref,
  ...input
}: TextFieldProps) {
  const { tokens } = useAppTheme();
  const [focused, setFocused] = useState(false);
  const borderColor = error ? tokens.danger : focused ? tokens.accent : tokens.line2;
  return (
    <View style={[{ gap: spacing[1] }, style]}>
      {label !== undefined && (
        <SurfaceText font="text-xs" weight="500" style={{ color: error ? tokens.danger : tokens.muted }}>
          {label}
        </SurfaceText>
      )}
      <View
        style={{
          flexDirection: 'row',
          alignItems: multiline ? 'flex-start' : 'center',
          minHeight: MIN_TOUCH_TARGET + 4,
          borderRadius: 12,
          borderWidth: focused ? 2 : 1,
          // Keeps the text still when the focused border thickens.
          margin: focused ? 0 : 1,
          borderColor,
          backgroundColor: disabled ? tokens.track : tokens.card,
          paddingLeft: spacing[3],
          paddingRight: right ? spacing[1] : spacing[3],
        }}
      >
        <TextInput
          ref={ref}
          {...input}
          multiline={multiline}
          editable={!disabled && input.editable !== false}
          accessibilityLabel={accessibilityLabel ?? (typeof label === 'string' ? label : undefined)}
          placeholderTextColor={input.placeholderTextColor ?? tokens.placeholder}
          selectionColor={tokens.accent}
          cursorColor={tokens.accent}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[
            {
              flex: 1,
              minWidth: 0,
              paddingVertical: spacing[3],
              fontFamily: fontFamily.text,
              fontSize: 16,
              color: disabled ? tokens.muted : tokens.ink,
              textAlignVertical: multiline ? 'top' : 'center',
            },
            contentStyle,
          ]}
        />
        {right}
      </View>
    </View>
  );
}
