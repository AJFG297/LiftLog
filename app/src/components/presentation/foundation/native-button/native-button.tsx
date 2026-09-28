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
          // The Host's seedColor tint is the text-safe accent (lighter in dark mode). A prominent button puts
          // a white label on its tint, so it alone needs the fill.
          ...(variant === 'filled' ? [tint(tokens.accent)] : []),
          ...(disabled ? [disabledModifier(true)] : []),
        ]}
      />
    </Host>
  );
}
