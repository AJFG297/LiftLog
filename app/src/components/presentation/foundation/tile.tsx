import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { useAppTheme } from '@/hooks/useAppTheme';
import { ReactNode, Ref } from 'react';
import { Pressable, View } from 'react-native';

/** A labelled number that opens the number pad, like a Targets card's Sets and Reps; `active` while it is on the pad. */
export function Tile(props: {
  label: string;
  accessibilityLabel: string;
  active: boolean;
  onPress: () => void;
  testID: string;
  children: ReactNode;
  ref?: Ref<View>;
}) {
  const { tokens } = useAppTheme();
  return (
    <Pressable
      ref={props.ref}
      testID={props.testID}
      onPress={props.onPress}
      accessibilityRole="button"
      accessibilityLabel={props.accessibilityLabel}
      accessibilityState={{ selected: props.active }}
      style={{
        flex: 1,
        height: 76,
        borderRadius: 12,
        justifyContent: 'center',
        gap: 2,
        borderWidth: props.active ? 2 : 1,
        paddingHorizontal: props.active ? 13 : 14,
        borderColor: props.active ? tokens.accent : tokens.line,
        backgroundColor: props.active ? tokens.card : tokens.bg,
      }}
    >
      <SurfaceText
        font="text-xs"
        weight={props.active ? '500' : undefined}
        style={{ color: props.active ? tokens.accentInk : tokens.muted }}
      >
        {props.label}
      </SurfaceText>
      {props.children}
    </Pressable>
  );
}

/** The tile's big number. */
export function TileValue({ text, style }: { text: string; style?: object }) {
  const { tokens } = useAppTheme();
  return (
    <SurfaceText numeric font="text-3xl" weight="500" style={[{ color: tokens.ink }, style]}>
      {text}
    </SurfaceText>
  );
}
