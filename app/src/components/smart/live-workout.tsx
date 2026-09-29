import FullHeightScrollView from '@/components/layout/full-height-scroll-view';
import { MsIconSrc } from '@/components/presentation/foundation/ms-icon-source';
import { PageActionsAccessory } from '@/components/presentation/foundation/page-actions/page-actions-accessory';
import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { MIN_TOUCH_TARGET } from '@/components/presentation/foundation/touch-target';
import { ExerciseStrip, ExerciseStripTile } from '@/components/presentation/live-workout/exercise-strip';
import { LiveWorkoutHeader } from '@/components/presentation/live-workout/live-workout-header';
import { SupersetBanner } from '@/components/presentation/live-workout/superset-banner';
import { UpNextBar } from '@/components/presentation/live-workout/up-next-bar';
import { CardioTimer } from '@/components/presentation/workout/cardio/cardio-timer';
import RestTimer from '@/components/presentation/workout/rest-timer';
import { LiveExerciseCard } from '@/components/smart/live-exercise-card';
import { withCardioSetUpdate, withRestTimerAt } from '@/components/smart/recorded-exercise-view';
import { getSessionWorkoutEditorHref } from '@/components/smart/session-workout-editor';
import { useAddExercise } from '@/hooks/useAddExercise';
import { spacing, useAppTheme } from '@/hooks/useAppTheme';
import { useLiveWorkoutFocus } from '@/hooks/useLiveWorkoutFocus';
import { RecordedCardioExercise, RecordedWeightedExercise, Session } from '@/models/session-models';
import {
  exerciseLabelOf,
  ExerciseGroup,
  isGroupComplete,
  nextExerciseInGroup,
  setProgressOf,
  upNextGroupIndexOf,
} from '@/models/session-models/exercise-groups';
import { useAppSelector } from '@/store';
import { showSnackbar, setLiveWorkoutFocus } from '@/store/app';
import { OffsetDateTime } from '@js-joda/core';
import { useTranslate } from '@tolgee/react';
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Pressable, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { useDispatch } from 'react-redux';

interface LiveWorkoutProps {
  session: Session;
  updateSession: (update: (session: Session) => Session) => void;
  onFinish: () => void;
}

/**
 * The workout in progress, one exercise (or one superset) at a time: the strip of exercises across the top,
 * the focused page, and the "Up next" bar. Logging a set still uses the older set tiles.
 */
export function LiveWorkout({ session, updateSession, onFinish }: LiveWorkoutProps) {
  const { tokens } = useAppTheme();
  const { t } = useTranslate();
  const { push, dismissTo } = useRouter();
  const dispatch = useDispatch();
  const restTimersEnabled = useAppSelector((x) => x.settings.restTimersEnabled);
  const addNewExercise = useAddExercise(session.id);
  const { groups, focusedGroupIndex, focusedGroup, focusedExerciseIndex, isPinned, focusExercise } =
    useLiveWorkoutFocus(session);
  const scrollRef = useRef<ScrollView>(null);
  // An exercise added mid-workout is usually the one to do now, so the screen moves to it.
  const addExercise = () => {
    focusExercise(session.recordedExercises.length);
    addNewExercise();
  };

  // The page the workout opens on is inferred from where it is up to. Pin it, so logging the page's last
  // set doesn't move the screen on before the user asks to with "Up next".
  useEffect(() => {
    if (!isPinned && focusedExerciseIndex !== undefined) {
      dispatch(setLiveWorkoutFocus({ sessionId: session.id, exerciseIndex: focusedExerciseIndex }));
    }
  }, [isPinned, focusedExerciseIndex, session.id, dispatch]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [focusedGroupIndex]);

  const tiles: ExerciseStripTile[] = session.recordedExercises.map((exercise, index) => {
    const progress = setProgressOf(exercise);
    return {
      key: `${index}-${exercise.blueprint.name}`,
      label: exerciseLabelOf(groups, index),
      name: exercise.blueprint.name,
      done: progress.done,
      total: progress.total,
      isCurrent: !!focusedGroup?.indices.includes(index),
      isComplete: exercise.isComplete,
      isSuperset: groups.some((group) => group.supersetLetter && group.indices.includes(index)),
      onPress: () => focusExercise(index),
    };
  });

  const pageLabel = focusedGroup ? pageLabelOf(t, focusedGroup, session.recordedExercises.length) : undefined;
  const nextInGroup = focusedGroup ? nextExerciseInGroup(session, focusedGroup) : undefined;
  const upNextIndex =
    focusedGroupIndex === undefined ? undefined : upNextGroupIndexOf(session, groups, focusedGroupIndex);
  const upNextGroup = upNextIndex === undefined ? undefined : groups[upNextIndex];

  const timer = useWorkoutTimer(session, updateSession, restTimersEnabled);

  return (
    <View style={{ flex: 1, backgroundColor: tokens.bg }}>
      <LiveWorkoutHeader
        workoutName={session.blueprint.name}
        startTime={session.startTime}
        onMinimise={() => dismissTo('/')}
        onEditWorkout={() => push(getSessionWorkoutEditorHref(session.id))}
        onFinish={onFinish}
      />
      <ExerciseStrip tiles={tiles} onAddExercise={addExercise} />
      <FullHeightScrollView
        scrollRef={scrollRef}
        scrollStyle={{ backgroundColor: tokens.bg }}
        contentContainerStyle={{
          paddingHorizontal: spacing.pageHorizontalMargin,
          paddingTop: spacing[2],
          paddingBottom: spacing[10],
          gap: spacing[3],
        }}
        floatingChildren={
          <View
            style={{
              gap: spacing[2],
              paddingHorizontal: spacing.pageHorizontalMargin,
              paddingTop: spacing[2],
              paddingBottom: spacing[3],
              backgroundColor: tokens.bg,
              borderTopWidth: 1,
              borderTopColor: tokens.line,
            }}
          >
            <PageActionsAccessory>{timer}</PageActionsAccessory>
            {upNextGroup ? (
              <UpNextBar
                kind="next"
                name={upNextGroup.indices.map((index) => session.recordedExercises[index]!.blueprint.name).join(' + ')}
                currentDone={!!focusedGroup && isGroupComplete(session, focusedGroup)}
                onPress={() => focusExercise(upNextGroup.indices[0]!)}
              />
            ) : (
              <UpNextBar kind="finish" onPress={onFinish} />
            )}
          </View>
        }
      >
        {focusedGroup ? (
          <>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingLeft: spacing[1],
              }}
            >
              <SurfaceText font="text-sm" weight="600" style={{ color: tokens.muted }}>
                {pageLabel}
              </SurfaceText>
              <OutlinedPill
                testID="all-exercises"
                icon="formatListBulleted"
                label={t('live_workout.all_exercises.button')}
                onPress={() => push('/session/exercises')}
              />
            </View>
            {focusedGroup.supersetLetter ? <SupersetBanner /> : null}
            {focusedGroup.indices.map((index) => (
              <LiveExerciseCard
                key={`${index}-${session.recordedExercises[index]!.blueprint.name}`}
                session={session}
                exerciseIndex={index}
                updateSession={updateSession}
                toStartNext={nextInGroup === index}
                compact={focusedGroup.indices.length > 1}
              />
            ))}
          </>
        ) : (
          <View style={{ alignItems: 'center', gap: spacing[4], paddingVertical: spacing[8] }}>
            <SurfaceText style={{ color: tokens.muted, textAlign: 'center' }}>
              {t('live_workout.empty.body')}
            </SurfaceText>
            <OutlinedPill icon="add" label={t('exercise.add.title')} onPress={addExercise} />
          </View>
        )}
      </FullHeightScrollView>
    </View>
  );
}

type TranslateFn = ReturnType<typeof useTranslate>['t'];

function pageLabelOf(t: TranslateFn, group: ExerciseGroup, total: number): string {
  const first = group.indices[0]! + 1;
  const last = group.indices.at(-1)! + 1;
  return first === last
    ? t('live_workout.page.label', { number: first, total })
    : t('live_workout.page_superset.label', { first, last, total });
}

function OutlinedPill(props: {
  icon: 'formatListBulleted' | 'add';
  label: string;
  onPress: () => void;
  testID?: string;
}) {
  const { tokens } = useAppTheme();
  return (
    <Pressable
      testID={props.testID}
      onPress={props.onPress}
      accessibilityRole="button"
      style={{ minHeight: MIN_TOUCH_TARGET, justifyContent: 'center' }}
    >
      {({ pressed }) => (
        <View
          style={{
            minHeight: 36,
            paddingHorizontal: spacing[3],
            borderRadius: 18,
            borderWidth: 1,
            borderColor: tokens.line,
            backgroundColor: pressed ? tokens.track : tokens.card,
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing[2],
          }}
        >
          <MsIconSrc name={props.icon} size={16} color={tokens.ink} />
          <SurfaceText font="text-sm" weight="600" style={{ color: tokens.ink }}>
            {props.label}
          </SurfaceText>
        </View>
      )}
    </Pressable>
  );
}

/**
 * The rest timer, or the running cardio clock, docked above the "Up next" bar. Unchanged from the list
 * screen; PM-30 moves rest into the header.
 */
function useWorkoutTimer(
  session: Session,
  updateSession: (update: (session: Session) => Session) => void,
  restTimersEnabled: boolean,
) {
  const { t } = useTranslate();
  const dispatch = useDispatch();
  const resetTimer = (time: OffsetDateTime | undefined) => updateSession((s) => withRestTimerAt(s, time));
  const dismissTimer = () => {
    const dismissedTimer = session.restTimer;
    resetTimer(undefined);
    dispatch(
      showSnackbar({
        text: t('rest_timer.dismissed.message'),
        action: t('generic.undo.button'),
        onAction: () => updateSession((s) => s.with({ restTimer: dismissedTimer })),
      }),
    );
  };

  const runningCardio = session.runningCardioSet;
  if (runningCardio) {
    const update = (updater: Parameters<typeof withCardioSetUpdate>[2]) =>
      updateSession(
        withCardioSetUpdate(runningCardio.exerciseIndex, runningCardio.setIndex, updater, OffsetDateTime.now()),
      );
    return (
      <CardioTimer
        set={runningCardio.set}
        onPersist={() => update((s) => s.withTimerReanchored(OffsetDateTime.now()))}
        onStop={() => update((s) => s.withTimerStopped(OffsetDateTime.now()))}
      />
    );
  }

  const lastExercise = session.lastExercise;
  // A weighted exercise rests per exercise; cardio rests per set, and may not rest at all.
  const rest =
    lastExercise instanceof RecordedWeightedExercise
      ? lastExercise.restAfterLastSet
      : lastExercise instanceof RecordedCardioExercise
        ? lastExercise.lastCompletedSet?.blueprint.restBetweenSets
        : undefined;
  if (!restTimersEnabled || !session.nextExercise || !rest || !session.restTimer) {
    return undefined;
  }
  // Only a weighted set can be failed - cardio has no rep count to fall short of.
  const failed = lastExercise instanceof RecordedWeightedExercise && lastExercise.lastSetMissedTarget;
  return (
    <RestTimer
      rest={rest}
      startTime={session.restTimer.startedAt}
      pausedAt={session.restTimer.pausedAt}
      failed={failed}
      onRestart={() => resetTimer(OffsetDateTime.now())}
      onDismiss={dismissTimer}
      onTogglePause={() => updateSession((s) => s.with({ restTimer: s.restTimer?.togglePause(OffsetDateTime.now()) }))}
    />
  );
}
