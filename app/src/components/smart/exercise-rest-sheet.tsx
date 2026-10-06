import { ActionButton } from '@/components/presentation/foundation/action-button';
import { haptics } from '@/components/presentation/foundation/haptics';
import { SheetHeader } from '@/components/presentation/foundation/sheet-header';
import { MIN_TOUCH_TARGET } from '@/components/presentation/foundation/touch-target';
import { WHEEL_PICKER_HEIGHT, WheelPicker } from '@/components/presentation/foundation/wheel-picker';
import { spacing, useAppTheme } from '@/hooks/useAppTheme';
import {
  durationOfRestPick,
  REST_PICK_MINUTES,
  REST_PICK_SECONDS,
  RestPick,
  restPickOf,
  restWithPick,
  sessionWithExerciseRest,
} from '@/models/rest-default';
import { RecordedWeightedExercise, Session } from '@/models/session-models';
import { useAppSelector } from '@/store';
import { selectActiveSession, updateStoredSession } from '@/store/stored-sessions';
import { formatTimeSpan } from '@/utils/format-time-span';
import { useTranslate } from '@tolgee/react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDispatch } from 'react-redux';

const SAVE_BUTTON_HEIGHT = 54;
/** The Android tab bar draws over the session stack's sheets, so the sheet must clear it. */
const ANDROID_TAB_BAR_HEIGHT = 80;

type ExerciseRestParams = { exerciseIndex?: string };

/**
 * The one detent of the exercise rest sheet: just tall enough for its header, wheels and button, so
 * most of the workout stays in view behind it.
 */
export function useExerciseRestSheetDetent(): number {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const content =
    MIN_TOUCH_TARGET + 2 * spacing[3] + WHEEL_PICKER_HEIGHT + spacing[4] + SAVE_BUTTON_HEIGHT + spacing[4];
  const below = insets.bottom + (Platform.OS === 'android' ? ANDROID_TAB_BAR_HEIGHT : 0);
  return Math.min(0.9, (content + below) / height);
}

/** Changes one exercise's rest for the workout in progress, opened from its Rest shortcut. */
export function ExerciseRestSheet() {
  const session = useAppSelector(selectActiveSession);
  const params = useLocalSearchParams<ExerciseRestParams>();
  const { back } = useRouter();
  const exerciseIndex = Number(params.exerciseIndex);
  const exercise = session?.recordedExercises[exerciseIndex];
  const found = exercise instanceof RecordedWeightedExercise;

  useEffect(() => {
    if (!found) {
      back();
    }
  }, [found, back]);

  return found && session ? <SheetContent session={session} exerciseIndex={exerciseIndex} exercise={exercise} /> : null;
}

function SheetContent(props: { session: Session; exerciseIndex: number; exercise: RecordedWeightedExercise }) {
  const { session, exerciseIndex, exercise } = props;
  const { tokens } = useAppTheme();
  const { t } = useTranslate();
  const { back } = useRouter();
  const dispatch = useDispatch();
  const [pick, setPick] = useState<RestPick>(() => restPickOf(exercise.blueprint.restBetweenSets.minRest));
  // A second tap while the sheet animates away would go back past the workout.
  const [saved, setSaved] = useState(false);
  const rest = durationOfRestPick(pick);

  const save = () => {
    if (saved) {
      return;
    }
    setSaved(true);
    dispatch(
      updateStoredSession({
        sessionId: session.id,
        update: (s) => {
          const current = s.recordedExercises[exerciseIndex];
          return current instanceof RecordedWeightedExercise
            ? sessionWithExerciseRest(s, exerciseIndex, restWithPick(current.blueprint.restBetweenSets, pick))
            : s;
        },
      }),
    );
    haptics.selection();
    back();
  };

  return (
    // The wheels run edge to edge, so a thumb near the side of the sheet turns one rather than dragging it.
    <View style={{ flex: 1, backgroundColor: tokens.card }}>
      <View style={{ paddingHorizontal: spacing.pageHorizontalMargin }}>
        <SheetHeader title={t('live_workout.exercise_rest.title')} subtitle={exercise.blueprint.name} onClose={back} />
      </View>
      <WheelPicker
        testID="exercise-rest-wheel"
        columns={[
          {
            key: 'minutes',
            options: REST_PICK_MINUTES.map((m) => ({ value: m, label: String(m) })),
            value: pick.minutes,
            onChange: (minutes) => setPick((p) => ({ ...p, minutes })),
            unit: t('live_workout.exercise_rest.minutes.label'),
            accessibilityLabel: t('live_workout.exercise_rest.minutes_wheel.label'),
          },
          {
            key: 'seconds',
            options: REST_PICK_SECONDS.map((s) => ({ value: s, label: String(s).padStart(2, '0') })),
            value: pick.seconds,
            onChange: (seconds) => setPick((p) => ({ ...p, seconds })),
            unit: t('live_workout.exercise_rest.seconds.label'),
            accessibilityLabel: t('live_workout.exercise_rest.seconds_wheel.label'),
          },
        ]}
      />
      <View style={{ marginTop: spacing[4], paddingHorizontal: spacing.pageHorizontalMargin }}>
        <ActionButton
          testID="exercise-rest-save"
          label={t('live_workout.exercise_rest.save.button', { time: formatTimeSpan(rest) })}
          // No rest at all isn't a rest time; turning rest timers off is the way to have none.
          disabled={rest.isZero()}
          onPress={save}
        />
      </View>
    </View>
  );
}
