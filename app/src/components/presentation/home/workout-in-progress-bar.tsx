import { floatingShadowStyle } from '@/components/presentation/foundation/floating-shadow';
import { MsIconSrc } from '@/components/presentation/foundation/ms-icon-source';
import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { REST_TICK_MS } from '@/components/presentation/live-workout/rest-pill';
import { spacing, useAppTheme } from '@/hooks/useAppTheme';
import { useNow } from '@/hooks/useNow';
import { restPhaseOf, RestWindow } from '@/models/session-models/rest';
import { formatDuration } from '@/utils/format-duration';
import { formatCountdown } from '@/utils/format-time-span';
import { Duration, OffsetDateTime } from '@js-joda/core';
import { useTranslate } from '@tolgee/react';
import { ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

const BAR_HEIGHT = 66;

interface WorkoutInProgressBarProps {
  workoutName: string;
  /** When the first set was logged; the clock shows zero until then. */
  startTime: OffsetDateTime | undefined;
  /** "Bench Press · set 3 of 5 next". */
  nextText: string;
  /** Undefined with rest timers off. */
  restWindow: RestWindow | undefined;
  /** "Go" once the rest is over. */
  restOverText: string;
  onResume: () => void;
  /** The trailing menu (Resume, Clear current workout). */
  menu: ReactNode;
  /** Space kept below the bar, for a tab bar the content runs under. */
  bottomInset?: number;
}

/**
 * The minimised workout, on the inverse slab above the tab bar: its name, how long it has run, the next
 * set and the rest countdown. Tapping it goes back to the workout.
 */
export function WorkoutInProgressBar(props: WorkoutInProgressBarProps) {
  const { tokens } = useAppTheme();
  const { t } = useTranslate();
  return (
    <View
      style={{
        paddingHorizontal: spacing[3],
        paddingTop: spacing[2],
        paddingBottom: spacing[2] + 2 + (props.bottomInset ?? 0),
        backgroundColor: tokens.bg,
      }}
    >
      <View style={[{ borderRadius: 20 }, Platform.OS === 'ios' ? floatingShadowStyle : undefined]}>
        {/*
          The resume target fills the slab from behind rather than wrapping it, so a screen reader sees
          it, the rest chip and the menu as three elements instead of folding them into one button. The
          content above lets touches through to it everywhere but the menu.
        */}
        <Pressable
          testID="workout-in-progress-bar"
          onPress={props.onResume}
          accessibilityRole="button"
          accessibilityLabel={t('in_progress_bar.resume.label', { name: props.workoutName })}
          accessibilityHint={props.nextText}
          style={({ pressed }) => [
            StyleSheet.absoluteFill,
            { borderRadius: 20, backgroundColor: pressed ? tokens.inverseRaised : tokens.inverse },
          ]}
        />
        <View
          style={{
            minHeight: BAR_HEIGHT,
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing[3],
            paddingLeft: spacing[4],
            paddingRight: spacing[1],
            paddingVertical: spacing[2],
            pointerEvents: 'box-none',
          }}
        >
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={{
              flex: 1,
              minWidth: 0,
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing[3],
              pointerEvents: 'none',
            }}
          >
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: tokens.invAccent }} />
            <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing[2] }}>
                <SurfaceText
                  font="text-base"
                  weight="700"
                  numberOfLines={1}
                  style={{ color: tokens.inverseInk, flexShrink: 1, fontSize: 15 }}
                >
                  {props.workoutName}
                </SurfaceText>
                <ElapsedText startTime={props.startTime} />
              </View>
              <SurfaceText font="text-sm" numberOfLines={1} style={{ color: tokens.inverseMuted, fontSize: 13 }}>
                {props.nextText}
              </SurfaceText>
            </View>
          </View>
          <RestChip window={props.restWindow} overText={props.restOverText} />
          {props.menu}
        </View>
      </View>
    </View>
  );
}

/** Ticks on its own, so the rest of the bar doesn't re-render every second. */
function ElapsedText({ startTime }: { startTime: OffsetDateTime | undefined }) {
  const { tokens } = useAppTheme();
  const now = useNow(1000);
  const elapsed = startTime && startTime.isBefore(now) ? Duration.between(startTime, now) : Duration.ZERO;
  return (
    <SurfaceText font="text-sm" numeric weight="500" style={{ color: tokens.inverseMuted, fontSize: 13 }}>
      {formatDuration(elapsed)}
    </SurfaceText>
  );
}

/** The live rest countdown, then Go once it runs out. Nothing while no rest is running. */
function RestChip({ window, overText }: { window: RestWindow | undefined; overText: string }) {
  const { tokens } = useAppTheme();
  const { t } = useTranslate();
  const now = useNow(REST_TICK_MS);
  const phase = restPhaseOf(window, now);
  if (phase.kind === 'idle') {
    return null;
  }
  const text = phase.kind === 'resting' ? formatCountdown(phase.remaining) : overText;
  return (
    <View
      testID="workout-in-progress-rest"
      accessible
      accessibilityLabel={
        phase.kind === 'resting' ? t('rest_pill.resting.label', { time: text }) : t('in_progress_bar.rest_over.label')
      }
      style={{
        minHeight: 44,
        paddingHorizontal: spacing[3],
        borderRadius: 14,
        backgroundColor: phase.kind === 'resting' ? tokens.inverseRaised2 : tokens.accent,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        pointerEvents: 'none',
      }}
    >
      <MsIconSrc name="timer" size={16} color={phase.kind === 'resting' ? tokens.inverseInk : tokens.onAccent} />
      <SurfaceText
        font="text-base"
        numeric={phase.kind === 'resting'}
        weight="600"
        style={{ color: phase.kind === 'resting' ? tokens.inverseInk : tokens.onAccent, fontSize: 15 }}
      >
        {text}
      </SurfaceText>
    </View>
  );
}
