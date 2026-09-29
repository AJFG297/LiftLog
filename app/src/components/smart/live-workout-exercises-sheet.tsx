import WeightDisplay from '@/components/presentation/foundation/editors/weight-display';
import { MsIconSrc } from '@/components/presentation/foundation/ms-icon-source';
import { SheetHeader } from '@/components/presentation/foundation/sheet-header';
import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { ExerciseOverviewRow, SupersetGroupHeader } from '@/components/presentation/live-workout/exercise-overview-row';
import { ReorderableItem, ReorderableList } from '@/components/presentation/live-workout/reorderable-list';
import { targetLabel } from '@/components/presentation/live-workout/target-text';
import { getSessionExerciseEditorHref } from '@/components/smart/session-exercise-editor';
import { useAddExercise } from '@/hooks/useAddExercise';
import { spacing, useAppTheme } from '@/hooks/useAppTheme';
import { useLiveWorkoutFocus } from '@/hooks/useLiveWorkoutFocus';
import { usesBodyweight, useTodaysTarget } from '@/hooks/useTodaysTarget';
import { Session } from '@/models/session-models';
import {
  ExerciseGroup,
  exerciseLabelOf,
  exerciseStatusOf,
  groupMoveOrder,
  setProgressOf,
  withGroupMoved,
} from '@/models/session-models/exercise-groups';
import { useAppSelector } from '@/store';
import { setLiveWorkoutFocus } from '@/store/app';
import { selectActiveSession, updateStoredSession } from '@/store/stored-sessions';
import { Duration, OffsetDateTime } from '@js-joda/core';
import { useTranslate } from '@tolgee/react';
import BigNumber from 'bignumber.js';
import { useRouter } from 'expo-router';
import { ReactNode, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDispatch } from 'react-redux';

const ROW_GAP = spacing[2];

/** The "All exercises" sheet over the live workout: every exercise's status, jump, reorder and add. */
export function LiveWorkoutExercisesSheet() {
  const session = useAppSelector(selectActiveSession);
  const { back } = useRouter();

  const hasSession = !!session;
  useEffect(() => {
    if (!hasSession) {
      back();
    }
  }, [hasSession, back]);

  return session ? <SheetContent session={session} /> : null;
}

function SheetContent({ session }: { session: Session }) {
  const { tokens } = useAppTheme();
  const { t } = useTranslate();
  const { back, push } = useRouter();
  const dispatch = useDispatch();
  const insets = useSafeAreaInsets();
  const showBodyweight = useAppSelector((x) => x.settings.showBodyweight);
  const addExercise = useAddExercise(session.id);
  const targetFor = useTodaysTarget(session);
  const { groups, focusedGroup, focusedExerciseIndex } = useLiveWorkoutFocus(session);
  const [dragging, setDragging] = useState(false);

  const updateSession = (update: (session: Session) => Session) =>
    dispatch(updateStoredSession({ sessionId: session.id, update }));

  const progress = session.recordedExercises.map(setProgressOf);
  const doneSets = progress.reduce((sum, p) => sum + p.done, 0);
  const totalSets = progress.reduce((sum, p) => sum + p.total, 0);
  const minutesIn = session.startTime
    ? Math.max(0, Math.floor(Duration.between(session.startTime, OffsetDateTime.now()).toMinutes()))
    : 0;

  const jumpTo = (exerciseIndex: number) => {
    dispatch(setLiveWorkoutFocus({ sessionId: session.id, exerciseIndex }));
    back();
  };

  const move = (from: number, to: number) => {
    const order = groupMoveOrder(groups, from, to);
    updateSession((s) => withGroupMoved(s, from, to));
    // The page on screen follows its exercise to wherever it moved.
    if (focusedExerciseIndex !== undefined) {
      dispatch(setLiveWorkoutFocus({ sessionId: session.id, exerciseIndex: order.indexOf(focusedExerciseIndex) }));
    }
  };

  // The flag lives on the first of the pair, so the superset is made with the exercise after this one;
  // on the last exercise, with the one before it.
  const supersetFrom =
    focusedExerciseIndex === undefined || session.recordedExercises.length < 2
      ? undefined
      : Math.min(focusedExerciseIndex, session.recordedExercises.length - 2);

  const rowFor = (exerciseIndex: number, inSuperset: boolean, leading: ReactNode) => {
    const exercise = session.recordedExercises[exerciseIndex]!;
    const { done, total } = progress[exerciseIndex]!;
    const target = targetFor(exercise);
    return (
      <ExerciseOverviewRow
        key={exerciseIndex}
        testID={`overview-exercise-${exerciseIndex}`}
        label={exerciseLabelOf(groups, exerciseIndex)}
        name={exercise.blueprint.name}
        subtitle={
          target
            ? t('live_workout.exercise_row.subtitle', {
                done,
                total,
                target: targetLabel(t, target, usesBodyweight(exercise)),
              })
            : t('live_workout.exercise_row.sets.subtitle', { done, total })
        }
        status={exerciseStatusOf(exercise)}
        isCurrent={!!focusedGroup?.indices.includes(exerciseIndex)}
        inSuperset={inSuperset}
        leading={leading}
        onPress={() => jumpTo(exerciseIndex)}
      />
    );
  };

  const spacer = <View style={{ width: spacing[3] }} />;
  const seen = new Map<string, number>();
  const items: ReorderableItem[] = groups.map((group: ExerciseGroup) => {
    const names = group.indices.map((index) => session.recordedExercises[index]!.blueprint.name).join(' + ');
    // Keyed by name rather than position, so a row keeps its identity as it moves.
    const occurrence = (seen.get(names) ?? 0) + 1;
    seen.set(names, occurrence);
    return {
      key: `${names}#${occurrence}`,
      handleLabel: t('live_workout.reorder.handle.label', { name: names }),
      render: (handle) =>
        group.supersetLetter ? (
          <View style={{ gap: spacing[2] }}>
            <SupersetGroupHeader
              label={t('live_workout.superset_group.label', { letter: group.supersetLetter })}
              leading={handle}
            />
            {group.indices.map((index) => rowFor(index, true, spacer))}
          </View>
        ) : (
          rowFor(group.indices[0]!, false, handle)
        ),
    };
  });

  return (
    <View style={{ flex: 1, backgroundColor: tokens.card, paddingHorizontal: spacing.pageHorizontalMargin }}>
      <SheetHeader
        title={session.blueprint.name}
        subtitle={t('live_workout.exercises_sheet.subtitle', { done: doneSets, total: totalSets, minutes: minutesIn })}
        onClose={back}
      />
      {/* Above the list, not below it: the sheet opens at its lower detent, where its bottom is off screen. */}
      <View
        style={{
          flexDirection: 'row',
          gap: spacing[2],
          paddingBottom: spacing[3],
        }}
      >
        <SheetAction
          testID="sheet-add-exercise"
          label={t('exercise.add.title')}
          icon="add"
          filled
          onPress={() => {
            dispatch(setLiveWorkoutFocus({ sessionId: session.id, exerciseIndex: session.recordedExercises.length }));
            back();
            addExercise();
          }}
        />
        <SheetAction
          testID="sheet-make-superset"
          label={t('live_workout.make_superset.button')}
          disabled={supersetFrom === undefined}
          onPress={() => {
            if (supersetFrom === undefined) {
              return;
            }
            back();
            push(getSessionExerciseEditorHref(session.id, supersetFrom));
          }}
        />
      </View>
      <ScrollView
        scrollEnabled={!dragging}
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing[4], gap: spacing[3] }}
      >
        {session.blueprint.notes ? (
          <SurfaceText font="text-sm" style={{ color: tokens.muted, paddingHorizontal: spacing[1] }}>
            {session.blueprint.notes}
          </SurfaceText>
        ) : null}
        <ReorderableList items={items} gap={ROW_GAP} onMove={move} onDragChange={setDragging} />
        {showBodyweight ? (
          <View
            testID="bodyweight-card"
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: spacing[3],
              minHeight: spacing[16],
              borderRadius: 14,
              borderWidth: 1,
              borderColor: tokens.line,
            }}
          >
            <SurfaceText font="text-base" weight="600" style={{ color: tokens.ink }}>
              {t('exercise.bodyweight.label')}
            </SurfaceText>
            <WeightDisplay
              allowNull={true}
              weight={session.bodyweight}
              updateWeight={(bodyweight) => updateSession((s) => s.with({ bodyweight }))}
              increment={new BigNumber('0.1')}
              label={t('exercise.bodyweight.label')}
            />
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

function SheetAction(props: {
  label: string;
  icon?: 'add';
  filled?: boolean;
  disabled?: boolean;
  onPress: () => void;
  testID?: string;
}) {
  const { tokens } = useAppTheme();
  const ink = props.filled ? tokens.inverseInk : props.disabled ? tokens.faint : tokens.ink;
  return (
    <Pressable
      testID={props.testID}
      onPress={props.onPress}
      disabled={props.disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!props.disabled }}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: spacing[12],
        borderRadius: 14,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing[2],
        paddingHorizontal: spacing[3],
        backgroundColor: props.filled ? tokens.inverse : pressed ? tokens.track : tokens.card,
        borderWidth: props.filled ? 0 : 1,
        borderColor: tokens.line,
        opacity: props.filled && pressed ? 0.85 : 1,
      })}
    >
      {props.icon ? <MsIconSrc name={props.icon} size={18} color={ink} /> : null}
      <SurfaceText font="text-base" weight="600" style={{ color: ink }}>
        {props.label}
      </SurfaceText>
    </Pressable>
  );
}
