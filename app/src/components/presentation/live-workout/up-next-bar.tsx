import { MsIconSrc } from '@/components/presentation/foundation/ms-icon-source';
import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { spacing, useAppTheme } from '@/hooks/useAppTheme';
import { useTranslate } from '@tolgee/react';
import { Pressable, View } from 'react-native';

const BAR_HEIGHT = 54;

type UpNextBarProps =
  | {
      kind: 'next';
      /** The next page's exercises, "Triceps + Fly" for a superset. */
      name: string;
      /** The page on screen is finished, so moving on is the obvious next step. */
      currentDone: boolean;
      onPress: () => void;
    }
  | { kind: 'finish'; onPress: () => void };

/** The bar under the live workout: the way to the next exercise, or Finish on the last one. */
export function UpNextBar(props: UpNextBarProps) {
  const { tokens } = useAppTheme();
  const { t } = useTranslate();

  if (props.kind === 'finish') {
    return (
      <Pressable
        testID="up-next-finish"
        onPress={props.onPress}
        accessibilityRole="button"
        style={({ pressed }) => ({
          minHeight: BAR_HEIGHT,
          borderRadius: 16,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: spacing[2],
          backgroundColor: tokens.accent,
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <MsIconSrc name="check" size={18} color={tokens.onAccent} />
        <SurfaceText font="text-base" weight="600" style={{ color: tokens.onAccent }}>
          {t('live_workout.finish_workout.button')}
        </SurfaceText>
      </Pressable>
    );
  }

  const done = props.currentDone;
  const kicker = done ? t('live_workout.up_next_done.label') : t('live_workout.up_next.label');
  return (
    <Pressable
      testID="up-next"
      onPress={props.onPress}
      accessibilityRole="button"
      accessibilityLabel={`${kicker}: ${props.name}`}
      style={({ pressed }) => ({
        minHeight: BAR_HEIGHT,
        borderRadius: 16,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing[3],
        paddingLeft: spacing[4],
        paddingRight: spacing[3],
        paddingVertical: spacing[2],
        backgroundColor: done ? tokens.accent : pressed ? tokens.track : tokens.card,
        borderWidth: done ? 0 : 1,
        borderColor: tokens.line,
        opacity: done && pressed ? 0.85 : 1,
      })}
    >
      <View style={{ flex: 1 }}>
        <SurfaceText font="text-xs" weight="600" style={{ color: done ? tokens.onAccent : tokens.muted }}>
          {kicker}
        </SurfaceText>
        <SurfaceText
          font="text-base"
          weight="600"
          numberOfLines={1}
          style={{ color: done ? tokens.onAccent : tokens.ink }}
        >
          {props.name}
        </SurfaceText>
      </View>
      <MsIconSrc name="arrowForward" size={20} color={done ? tokens.onAccent : tokens.ink} />
    </Pressable>
  );
}
