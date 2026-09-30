import { RoundIconButton } from '@/components/presentation/foundation/round-icon-button';
import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { MIN_TOUCH_TARGET } from '@/components/presentation/foundation/touch-target';
import { spacing, useAppTheme } from '@/hooks/useAppTheme';
import { formatDuration } from '@/utils/format-duration';
import { Duration, OffsetDateTime } from '@js-joda/core';
import { useTranslate } from '@tolgee/react';
import { ReactNode, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface LiveWorkoutHeaderProps {
  workoutName: string;
  /** When the first set was logged; the clock shows zero until then. */
  startTime: OffsetDateTime | undefined;
  /** Where the rest pill sits, between the title and Finish. */
  restSlot?: ReactNode;
  /** A thin line along the header's bottom edge, over its padding, so it never moves the screen. */
  restProgressSlot?: ReactNode;
  onMinimise: () => void;
  onEditWorkout: () => void;
  onFinish: () => void;
}

export function LiveWorkoutHeader(props: LiveWorkoutHeaderProps) {
  const { tokens } = useAppTheme();
  const { t } = useTranslate();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing[2],
        paddingTop: insets.top + spacing[2],
        paddingBottom: spacing[1],
        paddingHorizontal: spacing[3],
        backgroundColor: tokens.bg,
      }}
    >
      {props.restProgressSlot ? (
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}>
          {props.restProgressSlot}
        </View>
      ) : null}
      <RoundIconButton
        icon="expandMore"
        testID="minimise-workout"
        accessibilityLabel={t('live_workout.minimise.button')}
        accessibilityHint={t('live_workout.minimise.hint')}
        onPress={props.onMinimise}
      />
      <Pressable
        onPress={props.onEditWorkout}
        accessibilityRole="button"
        accessibilityHint={t('workout.edit.button')}
        style={{ flex: 1, minHeight: MIN_TOUCH_TARGET, justifyContent: 'center' }}
      >
        <SurfaceText font="text-base" weight="600" numberOfLines={1} style={{ color: tokens.ink }}>
          {props.workoutName}
        </SurfaceText>
        <ElapsedClock startTime={props.startTime} />
      </Pressable>
      {props.restSlot}
      <Pressable
        testID="finish-session-button"
        onPress={props.onFinish}
        accessibilityRole="button"
        style={{ minHeight: MIN_TOUCH_TARGET, justifyContent: 'center' }}
      >
        {({ pressed }) => (
          <View
            style={{
              minHeight: MIN_TOUCH_TARGET,
              paddingHorizontal: spacing[4],
              borderRadius: MIN_TOUCH_TARGET / 2,
              borderWidth: 1,
              borderColor: tokens.line,
              backgroundColor: pressed ? tokens.track : tokens.card,
              justifyContent: 'center',
            }}
          >
            <SurfaceText font="text-sm" weight="600" style={{ color: tokens.accentInk }}>
              {t('generic.finish.button')}
            </SurfaceText>
          </View>
        )}
      </Pressable>
    </View>
  );
}

/** Ticks on its own, so the rest of the screen doesn't re-render every second. */
function ElapsedClock({ startTime }: { startTime: OffsetDateTime | undefined }) {
  const { tokens } = useAppTheme();
  const { t } = useTranslate();
  const [now, setNow] = useState(() => OffsetDateTime.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(OffsetDateTime.now()), 1000);
    return () => clearInterval(interval);
  }, []);
  const elapsed = startTime && startTime.isBefore(now) ? Duration.between(startTime, now) : Duration.ZERO;
  const text = formatDuration(elapsed);
  return (
    <SurfaceText
      font="text-sm"
      numeric
      weight="500"
      accessibilityLabel={t('live_workout.elapsed.label', { time: text })}
      style={{ color: tokens.muted }}
    >
      {text}
    </SurfaceText>
  );
}
