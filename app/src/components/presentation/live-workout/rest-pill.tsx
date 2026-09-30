import { haptics } from '@/components/presentation/foundation/haptics';
import { MsIconSrc } from '@/components/presentation/foundation/ms-icon-source';
import { ProgressBar } from '@/components/presentation/foundation/progress-bar';
import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { MIN_TOUCH_TARGET } from '@/components/presentation/foundation/touch-target';
import { spacing, useAppTheme } from '@/hooks/useAppTheme';
import { useNow } from '@/hooks/useNow';
import { isRestCue, RestPhase, restPhaseOf, RestWindow } from '@/models/session-models/rest';
import { formatCountdown, formatTimeSpan } from '@/utils/format-time-span';
import { Duration, OffsetDateTime } from '@js-joda/core';
import { useTranslate } from '@tolgee/react';
import { useEffect, useRef } from 'react';
import { Pressable, View } from 'react-native';

/** Often enough that the countdown turns over within a quarter second of the notification's. */
export const REST_TICK_MS = 250;

interface RestPillProps {
  window: RestWindow | undefined;
  /** The rest of the exercise on screen, shown while nothing is running. */
  idleRest: Duration | undefined;
  /** What the rest leads to once it is over: "Set 3". */
  nextSet: string;
  onPress: () => void;
}

/**
 * The rest timer in the live workout's header: dark with a countdown while resting, the accent with
 * "Go · Set 3" once the rest is over, and outlined with the exercise's rest when nothing is running.
 */
export function RestPill({ window, idleRest, nextSet, onPress }: RestPillProps) {
  const { tokens } = useAppTheme();
  const { t } = useTranslate();
  const now = useNow(REST_TICK_MS);
  const phase = restPhaseOf(window, now);
  useRestCues(phase, window, now);

  const look =
    phase.kind === 'resting'
      ? { fill: tokens.inverse, ink: tokens.inverseInk, border: tokens.inverse }
      : phase.kind === 'ready'
        ? { fill: tokens.accent, ink: tokens.onAccent, border: tokens.accent }
        : { fill: tokens.card, ink: tokens.muted, border: tokens.line };
  const text =
    phase.kind === 'resting'
      ? formatCountdown(phase.remaining)
      : phase.kind === 'ready'
        ? t('rest_pill.go.button', { set: nextSet })
        : idleRest
          ? formatTimeSpan(idleRest)
          : t('rest_pill.idle_no_rest.button');
  const accessibilityLabel =
    phase.kind === 'resting'
      ? t('rest_pill.resting.label', { time: text })
      : phase.kind === 'ready'
        ? t('rest_pill.ready.label', { set: nextSet })
        : idleRest
          ? t('rest_pill.idle.label', { time: text })
          : t('rest_pill.idle_no_rest.label');

  return (
    <Pressable
      testID="rest-pill"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={{ minHeight: MIN_TOUCH_TARGET, justifyContent: 'center' }}
    >
      {({ pressed }) => (
        <View
          style={{
            minHeight: MIN_TOUCH_TARGET,
            minWidth: 96,
            paddingLeft: spacing[3],
            paddingRight: spacing[3] + 2,
            borderRadius: MIN_TOUCH_TARGET / 2,
            borderWidth: 1,
            borderColor: look.border,
            backgroundColor: look.fill,
            opacity: pressed ? 0.85 : 1,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: spacing[2] - 1,
          }}
        >
          <MsIconSrc name="timer" size={18} color={look.ink} />
          <SurfaceText
            font="text-base"
            weight="600"
            numeric={phase.kind !== 'ready'}
            numberOfLines={1}
            style={{ color: look.ink }}
          >
            {text}
          </SurfaceText>
        </View>
      )}
    </Pressable>
  );
}

/** The thin line under the header while resting: the share of the rest still to go. */
export function RestProgressLine({ window }: { window: RestWindow | undefined }) {
  const { t } = useTranslate();
  const now = useNow(REST_TICK_MS);
  const phase = restPhaseOf(window, now);
  if (phase.kind !== 'resting') {
    return null;
  }
  return (
    // The pill already says how long is left, so screen readers skip the line.
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <ProgressBar
        testID="rest-progress-line"
        progress={phase.remaining.toMillis() / phase.length.toMillis()}
        accessibilityLabel={t('rest_sheet.progress.label')}
        height={3}
        style={{ borderRadius: 0 }}
      />
    </View>
  );
}

/** Buzzes when the rest runs out, and again when its min to max window closes. */
function useRestCues(phase: RestPhase, window: RestWindow | undefined, now: OffsetDateTime) {
  const previous = useRef(phase);
  useEffect(() => {
    if (isRestCue(previous.current, phase, window, now)) {
      haptics.restOver();
    }
    previous.current = phase;
  });
}
