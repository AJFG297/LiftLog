import { NativeButtonProps, NativeButtonVariant } from './native-button-props';
import { useAppTheme } from '@/hooks/useAppTheme';
import { Button, Host } from '@expo/ui/swift-ui';
import { buttonStyle, controlSize, disabled as disabledModifier, tint } from '@expo/ui/swift-ui/modifiers';

const styleForVariant: Record<NativeButtonVariant, Parameters<typeof buttonStyle>[0]> = {
  filled: 'borderedProminent',
  tonal: 'bordered',
  outlined: 'bordered',
  // `plain` drops the tint along with the chrome, leaving a label that doesn't read as a button.
  text: 'borderless',
};

export default function NativeButton({
  label,
  onPress,
  systemImage,
  variant = 'filled',
  disabled,
  style,
}: NativeButtonProps) {
  const { colors, tokens } = useAppTheme();

  return (
    <Host matchContents seedColor={colors.seedColor} colorScheme={colors.scheme} style={style}>
      <Button
        label={label}
        systemImage={systemImage}
        onPress={onPress}
        modifiers={[
          buttonStyle(styleForVariant[variant]),
          controlSize('large'),
          // A prominent button puts a white label on the tint, so it needs the fill; the others use the tint as
          // text, which in dark mode needs the lighter ink.
          tint(variant === 'filled' ? tokens.accent : tokens.accentInk),
          ...(disabled ? [disabledModifier(true)] : []),
        ]}
      />
    </Host>
  );
}
