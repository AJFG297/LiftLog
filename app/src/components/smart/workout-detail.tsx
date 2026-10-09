import FullHeightScrollView from '@/components/layout/full-height-scroll-view';
import { ActionButton } from '@/components/presentation/foundation/action-button';
import PageMenu from '@/components/presentation/foundation/page-menu';
import { setBadgeText } from '@/components/presentation/foundation/set-badge/set-badge-kinds';
import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { useToast } from '@/components/presentation/foundation/toast';
import { ExerciseSetCard, SetRowCopy } from '@/components/presentation/workout-detail/exercise-set-card';
import { WorkoutDetailHeader } from '@/components/presentation/workout-detail/workout-detail-header';
import { WorkoutStat, WorkoutStatsRow } from '@/components/presentation/workout-detail/workout-stats-row';
import { formatExerciseSummary } from '@/components/presentation/summary/format-exercise-summary';
import { spacing, useAppTheme } from '@/hooks/useAppTheme';
import { useFormatDate } from '@/hooks/useFormatDate';
import { useOpenExerciseProgress } from '@/hooks/useOpenExerciseProgress';
import { useStartWorkoutWithConfirmation } from '@/hooks/useStartWorkoutWithConfirmation';
import { useWorkoutComparison } from '@/hooks/useWorkoutComparison';
import { MovementKey } from '@/models/blueprint-models';
import { SharedSession } from '@/models/feed-models';
import { RecordedWeightedExercise } from '@/models/session-models';
import { formatRpe } from '@/models/session-models/rpe';
import { shortFormatWeightUnit, Weight, WeightUnit } from '@/models/weight';
import { BestSetChange, bestSetComparisons, minutesOf, setCounts } from '@/models/workout-summary';
import { DetailSetRow, routineFromSession, sessionSetRows, uniqueRoutineName } from '@/models/workout-detail';
import { useAppSelector } from '@/store';
import { useWorkoutQuery } from '@/hooks/useWorkoutQuery';
import {
  addUnpublishedSessionId,
  encryptAndShare,
  removeReactionsForEvents,
  selectReceivedReactionsByEvent,
  selectSentReactionsByEvent,
  setSentReaction,
  upsertReceivedReactions,
} from '@/store/feed';
import {
  addProgramSession,
  fetchUpcomingSessions,
  removeSessionFromProgram,
  selectActiveProgram,
} from '@/store/program';
import { deleteStoredSession, putStoredSession, sessionFinished } from '@/store/stored-sessions';
import { useServices } from '@/components/smart/services-provider';
import { formatTimeRange } from '@/utils/format-time-range';
import { localeFormatBigNumber } from '@/utils/locale-bignumber';
import { OffsetDateTime } from '@js-joda/core';
import { UseTranslateResult, useTranslate } from '@tolgee/react';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDispatch } from 'react-redux';

/**
 * A past workout as one scrolling list: when it was, its figures, and every exercise's sets. From here it
 * can be done again, saved as a routine, edited, shared or deleted.
 */
export function WorkoutDetail({ sessionId }: { sessionId: string }) {
  const dispatch = useDispatch();
  const router = useRouter();
  const openExerciseProgress = useOpenExerciseProgress();
  const toast = useToast();
  const { t } = useTranslate();
  const { tokens } = useAppTheme();
  const insets = useSafeAreaInsets();
  const formatDate = useFormatDate();
  const locale = useAppSelector((x) => x.settings.preferredLanguage);
  const showFeed = useAppSelector((x) => x.settings.showFeed);
  const unit: WeightUnit = useAppSelector((x) => x.settings.useImperialUnits) ? 'pounds' : 'kilograms';
  // Edit workout opens on top of this screen; the workout and its comparison are re-read once it comes back
  // into focus. Wrapped, so `undefined` is "loading" and `{ session: undefined }` is "deleted".
  const loaded = useWorkoutQuery(async (repository) => ({ session: await repository.get(sessionId) }), [sessionId]);
  const session = loaded?.session;
  const comparison = useWorkoutComparison(session);
  const program = useAppSelector(selectActiveProgram);
  const programId = useAppSelector((x) => x.program.activePlanId);
  const receivedReactions = useAppSelector(selectReceivedReactionsByEvent);
  const sentReactions = useAppSelector(selectSentReactionsByEvent);
  const { start, confirmationDialog } = useStartWorkoutWithConfirmation();
  const { sessionService } = useServices();
  const [deleting, setDeleting] = useState(false);

  if (!session) {
    return (
      <View style={{ flex: 1, backgroundColor: tokens.bg, justifyContent: 'center', padding: spacing[6] }}>
        {/* Deleting here pops the screen as the session goes, so the message would only flash on the way out. */}
        {deleting || !loaded ? null : (
          <SurfaceText font="text-base" style={{ color: tokens.muted, textAlign: 'center' }}>
            {t('workout_detail.missing.body')}
          </SurfaceText>
        )}
      </View>
    );
  }

  const records = comparison?.records ?? [];
  const rowsByExercise = sessionSetRows(session, records);
  const changes = new Map<MovementKey, BestSetChange>(
    bestSetComparisons(session, comparison?.previous).map((x) => [x.key, x.change]),
  );

  const doAgain = () => start(sessionService.repeatSession(session));

  const saveAsRoutine = () => {
    const name = uniqueRoutineName(
      session.blueprint.name,
      program.sessions.map((s) => s.name),
    );
    const routine = routineFromSession(session, name);
    dispatch(addProgramSession({ programId, sessionBlueprint: routine }));
    dispatch(fetchUpcomingSessions());
    toast.show({
      message: t('workout_detail.saved_routine.message', { name, program: program.name }),
      action: {
        label: t('generic.undo.button'),
        onPress: () => {
          dispatch(removeSessionFromProgram({ programId, sessionBlueprint: routine }));
          dispatch(fetchUpcomingSessions());
        },
      },
    });
  };

  const share = () =>
    dispatch(encryptAndShare({ item: new SharedSession(session), title: t('workout.shared_item.title') }));

  const deleteWorkout = () => {
    // Undo puts the session's cheers back too, so they are kept aside rather than lost.
    const received = receivedReactions.get(session.id) ?? [];
    const sent = sentReactions.get(session.id) ?? [];
    setDeleting(true);
    router.back();
    dispatch(deleteStoredSession(session.id));
    // Queued either way: the feed publishes a queued session that exists and unpublishes one that doesn't.
    dispatch(addUnpublishedSessionId(session.id));
    dispatch(removeReactionsForEvents([session.id]));
    toast.show({
      message: t('workout_detail.deleted.message'),
      action: {
        label: t('generic.undo.button'),
        onPress: () => {
          dispatch(putStoredSession(session));
          // Finishing it again is what exports it back to the health app the delete removed it from, and
          // queues it for the feed.
          dispatch(sessionFinished(session.id));
          if (received.length) {
            dispatch(upsertReceivedReactions(received));
          }
          sent.forEach((reaction) => dispatch(setSentReaction(reaction)));
        },
      },
    });
  };

  const routineIndex = program.sessions.findIndex((s) => s.name === session.blueprint.name);
  const routineLine =
    routineIndex === -1
      ? undefined
      : t('workout_detail.program_day.label', { program: program.name, day: routineIndex + 1 });
  const date = formatDate(session.date, { weekday: 'long', month: 'short', day: 'numeric' });
  const { startTime, endTime } = session;
  const dateLine =
    startTime && endTime
      ? t('workout_detail.date_time.label', {
          date,
          time: formatTimeRange(epochDate(startTime), epochDate(endTime), locale),
        })
      : date;

  const minutes = minutesOf(session);
  const prCount = records.length;
  const stats: WorkoutStat[] = [
    {
      key: 'duration',
      value: minutes === undefined ? '-' : formatMinutes(minutes),
      label: t('workout_detail.duration.label'),
    },
    {
      key: 'volume',
      value: localeFormatBigNumber(session.totalWeightLifted.convertTo(unit).value, 0),
      label: t('workout_detail.volume.label', { unit: shortFormatWeightUnit(unit) }),
    },
    { key: 'sets', value: String(setCounts(session).working), label: t('workout_detail.sets.label') },
    {
      key: 'prs',
      value: String(prCount),
      label: prCount === 1 ? t('workout_detail.pr.label') : t('workout_detail.prs.label'),
      highlight: prCount > 0,
    },
  ];

  const headings = {
    set: t('workout_detail.column_set.label'),
    weight: shortFormatWeightUnit(unit),
    reps: t('workout_detail.column_reps.label'),
    oneRepMax: t('workout_detail.column_e1rm.label'),
  };

  return (
    <>
      <Stack.Screen options={{ title: '' }} />
      <PageMenu
        testID="workout-detail-more"
        items={[
          {
            label: t('workout.edit.button'),
            icon: 'edit',
            systemImage: 'pencil',
            onPress: () => router.push(`/workout-detail/edit?sessionId=${encodeURIComponent(session.id)}`),
          },
          ...(showFeed
            ? [
                {
                  label: t('workout.share_workout.button'),
                  icon: 'share' as const,
                  systemImage: 'square.and.arrow.up' as const,
                  onPress: share,
                },
              ]
            : []),
          {
            label: t('workout_detail.delete.button'),
            icon: 'delete',
            systemImage: 'trash',
            destructive: true,
            onPress: deleteWorkout,
          },
        ]}
      />
      <FullHeightScrollView
        contentContainerStyle={{
          paddingHorizontal: spacing.pageHorizontalMargin,
          paddingTop: spacing[1],
          gap: spacing[4],
        }}
        floatingChildren={
          <View
            style={{
              flexDirection: 'row',
              gap: 10,
              paddingHorizontal: spacing.pageHorizontalMargin,
              paddingTop: spacing[3],
              // FullHeightScrollView lifts the bar above the iOS home indicator; on Android the bar clears the
              // system navigation bar itself.
              paddingBottom: spacing[3] + (Platform.OS === 'android' ? insets.bottom : 0),
              backgroundColor: tokens.bg,
              borderTopWidth: 1,
              borderTopColor: tokens.line,
            }}
          >
            <ActionButton
              variant="secondary"
              label={t('workout_detail.save_as_routine.button')}
              onPress={saveAsRoutine}
              style={{ flex: 1 }}
              testID="workout-detail-save-as-routine"
            />
            <ActionButton
              label={t('workout_detail.do_again.button')}
              onPress={doAgain}
              style={{ flex: 1 }}
              testID="workout-detail-do-again"
            />
          </View>
        }
      >
        <WorkoutDetailHeader routineLine={routineLine} name={session.blueprint.name} dateLine={dateLine} />
        <WorkoutStatsRow stats={stats} />
        {session.recordedExercises.map((exercise, index) => {
          const rows = rowsByExercise[index];
          const weighted = exercise instanceof RecordedWeightedExercise;
          const change = weighted && exercise.isStarted ? changes.get(exercise.movementKey()) : undefined;
          return (
            <ExerciseSetCard
              key={`${exercise.blueprint.name}-${index}`}
              name={exercise.blueprint.name}
              note={change ? changeNote(change, t) : undefined}
              headings={headings}
              prLabel={t('workout_detail.pr.label')}
              rows={(rows ?? []).map((row) => rowCopy(row, unit, t))}
              openExercise={
                weighted
                  ? {
                      onPress: () => openExerciseProgress(exercise.blueprint.exerciseId),
                      accessibilityLabel: t('workout_detail.exercise.open.spoken', { name: exercise.blueprint.name }),
                    }
                  : undefined
              }
              fallbackText={
                weighted || !exercise.isStarted
                  ? t('workout_detail.not_done.label')
                  : formatExerciseSummary(exercise, {
                      isFilled: true,
                      showWeight: true,
                      bodyweightLabel: t('exercise.short_bodyweight.label'),
                    })
              }
            />
          );
        })}
      </FullHeightScrollView>
      {confirmationDialog}
    </>
  );
}

type Translate = UseTranslateResult['t'];

function rowCopy(row: DetailSetRow, unit: WeightUnit, t: Translate): SetRowCopy {
  const { text, accessibilityLabel } = setBadgeText(row.label, t);
  const weight = formatNumber(row.weight.convertTo(unit), 2);
  const oneRepMax = row.oneRepMax ? formatNumber(row.oneRepMax.convertTo(unit), 0) : undefined;
  const spoken = [
    t('workout_detail.set_row.spoken', {
      set: accessibilityLabel,
      weight: `${weight} ${shortFormatWeightUnit(unit)}`,
      reps: row.reps,
    }),
    row.rpe === undefined ? undefined : t('workout_detail.set_row_rpe.spoken', { rpe: row.rpe }),
    oneRepMax ? t('workout_detail.set_row_e1rm.spoken', { value: oneRepMax }) : undefined,
    row.pr ? t('workout_detail.set_row_pr.spoken') : undefined,
  ]
    .filter(Boolean)
    .join(', ');
  return {
    key: row.key,
    label: row.label,
    labelText: text,
    weight,
    reps: String(row.reps),
    rpe: row.rpe === undefined ? undefined : formatRpe(row.rpe),
    oneRepMax: oneRepMax ?? '–',
    pr: row.pr,
    spoken,
  };
}

function changeNote(change: BestSetChange, t: Translate): string | undefined {
  switch (change.type) {
    case 'new':
      return undefined;
    case 'same':
      return t('workout_detail.vs_last_same.label');
    case 'weight': {
      const amount = `${formatNumber(change.delta.with({ value: change.delta.value.abs() }), 2)} ${shortFormatWeightUnit(change.delta.unit)}`;
      return change.delta.value.isPositive()
        ? t('workout_detail.vs_last_weight_up.label', { amount })
        : t('workout_detail.vs_last_weight_down.label', { amount });
    }
    case 'reps': {
      const count = Math.abs(change.delta);
      if (change.delta > 0) {
        return count === 1
          ? t('workout_detail.vs_last_rep_up.label')
          : t('workout_detail.vs_last_reps_up.label', { count });
      }
      return count === 1
        ? t('workout_detail.vs_last_rep_down.label')
        : t('workout_detail.vs_last_reps_down.label', { count });
    }
  }
}

function formatNumber(weight: Weight, decimalPlaces: number): string {
  return localeFormatBigNumber(weight.value.decimalPlaces(decimalPlaces));
}

function formatMinutes(minutes: number): string {
  return minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function epochDate(time: OffsetDateTime): Date {
  return new Date(time.toInstant().toEpochMilli());
}
