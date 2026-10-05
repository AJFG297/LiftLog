import ConfirmationDialog from '@/components/presentation/foundation/confirmation-dialog';
import Menu, { MenuItem } from '@/components/presentation/foundation/menu';
import { RoundIconButton } from '@/components/presentation/foundation/round-icon-button';
import { ExerciseShortcut, FocusExerciseCard } from '@/components/presentation/live-workout/focus-exercise-card';
import { targetLabel, targetReasonText } from '@/components/presentation/live-workout/target-text';
import RecordedExerciseNotesEditor from '@/components/presentation/workout/recorded-exercise-notes-editor';
import { getExerciseHistoryHref } from '@/components/smart/exercise-history';
import { getExerciseStatsHref } from '@/components/smart/exercise-stats-href';
import { LiveSetTable } from '@/components/smart/live-set-table';
import { RecordedExerciseView } from '@/components/smart/recorded-exercise-view';
import { getSessionExerciseEditorHref } from '@/components/smart/session-exercise-editor';
import { useCarryOver } from '@/hooks/useCarryOver';
import { useExerciseSearch } from '@/hooks/useExerciseSearch';
import { LiveSetEntry } from '@/hooks/useLiveSetEntry';
import { usesBodyweight, useTodaysTarget } from '@/hooks/useTodaysTarget';
import {
  blueprintSwappedTo,
  sessionWithExerciseSwapped,
} from '@/components/presentation/workout-editor/exercise-picker';
import { RecordedExercise, RecordedWeightedExercise, Session } from '@/models/session-models';
import { exerciseGroupsOf, exerciseLabelOf } from '@/models/session-models/exercise-groups';
import { RootState, useAppSelector } from '@/store';
import { selectExercises } from '@/store/stored-sessions';
import { translateExerciseMeta } from '@/utils/exercise-meta';
import { formatTimeSpan } from '@/utils/format-time-span';
import { openUrl } from '@/utils/open-url';
import { useTranslate } from '@tolgee/react';
import { useRouter } from 'expo-router';
import { type Ref, useState } from 'react';
import { View } from 'react-native';
import { useStore } from 'react-redux';

interface LiveExerciseCardProps {
  session: Session;
  exerciseIndex: number;
  updateSession: (update: (session: Session) => Session) => void;
  toStartNext: boolean;
  /** On a superset page, next to the other members. */
  compact: boolean;
  entry: LiveSetEntry;
  editingRowRef: Ref<View>;
}

/** One exercise of the live workout: its title, shortcuts, today's target and its sets. */
export function LiveExerciseCard(props: LiveExerciseCardProps) {
  const { session, exerciseIndex, updateSession } = props;
  const { t } = useTranslate();
  const { push } = useRouter();
  const store = useStore<RootState>();
  const withCarryOver = useCarryOver();
  const exercises = useAppSelector(selectExercises);
  const targetFor = useTodaysTarget(session);
  const [notesOpen, setNotesOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const exercise = session.recordedExercises[exerciseIndex];

  const openSearch = useExerciseSearch(
    (picked) => {
      const state = store.getState();
      const swappedOut = state.storedSessions.sessions[session.id]?.recordedExercises[exerciseIndex]?.blueprint;
      if (!swappedOut) {
        return;
      }
      const ref = { id: picked.id, name: picked.descriptor.name };
      const key = blueprintSwappedTo(swappedOut, ref).progressionKey();
      withCarryOver(session.id, [key], (carryOver) =>
        updateSession((s) => sessionWithExerciseSwapped(s, exerciseIndex, swappedOut.movementKey(), ref, carryOver)),
      );
    },
    {
      name: session.blueprint.name,
      exerciseIds: session.recordedExercises.map((recorded) => recorded.blueprint.exerciseId),
    },
  );

  if (!exercise) {
    return null;
  }
  const blueprint = exercise.blueprint;
  const isWeighted = exercise instanceof RecordedWeightedExercise;
  const openEditor = () => push(getSessionExerciseEditorHref(session.id, exerciseIndex));

  const equipment = exercises[blueprint.exerciseId]?.equipment;
  const groups = exerciseGroupsOf(session.recordedExercises);
  const inSuperset = groups.some((group) => group.supersetLetter && group.indices.includes(exerciseIndex));
  // A superset rests after each round rather than after this exercise, so its place in the round says more.
  const meta = capitalise(
    [
      equipment ? translateExerciseMeta(t, 'equipment', equipment) : undefined,
      inSuperset
        ? t('live_workout.meta.superset.label', { label: exerciseLabelOf(groups, exerciseIndex) })
        : exercise instanceof RecordedWeightedExercise
          ? t('live_workout.meta.rest.label', { rest: formatTimeSpan(exercise.blueprint.restBetweenSets.minRest) })
          : undefined,
      exercise instanceof RecordedWeightedExercise ? workingSetsText(t, exercise.potentialSets.length) : undefined,
    ]
      .filter((part) => part !== undefined)
      .join(' · '),
  );

  const shortcuts: ExerciseShortcut[] = [
    {
      key: 'history',
      label: t('generic.history.title'),
      icon: 'history',
      onPress: () => push(getExerciseHistoryHref(blueprint), { withAnchor: true }),
    },
    ...(isWeighted
      ? [
          {
            key: 'warmup',
            label: t('live_workout.chip.warmup.button'),
            icon: 'localFireDepartment' as const,
            onPress: openEditor,
          },
        ]
      : []),
    { key: 'note', label: t('live_workout.chip.note.button'), icon: 'edit', onPress: () => setNotesOpen(true) },
    {
      key: 'swap',
      label: t('live_workout.chip.swap.button'),
      icon: 'swapHoriz',
      onPress: () => openSearch(blueprint.name),
    },
  ];

  const menuItems: MenuItem[] = [
    { label: t('generic.edit.button'), icon: 'edit', systemImage: 'pencil', onPress: openEditor },
    ...(isWeighted
      ? [
          {
            label: t('stats.stats.title'),
            icon: 'analytics',
            systemImage: 'chart.bar',
            onPress: () =>
              push(getExerciseStatsHref(blueprint.exerciseId), {
                withAnchor: true,
              }),
          } satisfies MenuItem,
        ]
      : []),
    {
      label: t('generic.remove.button'),
      icon: 'delete',
      systemImage: 'trash',
      destructive: true,
      onPress: () => setRemoveOpen(true),
    },
    ...(blueprint.link
      ? [
          {
            label: t('generic.open_link.button'),
            icon: 'openInBrowser',
            systemImage: 'safari',
            onPress: () => openUrl(blueprint.link),
          } satisfies MenuItem,
        ]
      : []),
  ];

  const target = targetFor(exercise);

  return (
    <>
      <FocusExerciseCard
        testID={`live-exercise-${exerciseIndex}`}
        name={blueprint.name}
        meta={meta}
        compact={props.compact}
        shortcuts={shortcuts}
        menu={
          <Menu
            testID="more-exercise-btn"
            size={44}
            items={menuItems}
            trigger={(open) => (
              <RoundIconButton
                icon="moreHoriz"
                size="compact"
                accessibilityLabel={t('live_workout.exercise_more.button', { name: blueprint.name })}
                onPress={open}
              />
            )}
          />
        }
        target={
          target
            ? {
                title: t('live_workout.target.title', { target: targetLabel(t, target, usesBodyweight(exercise)) }),
                body: targetReasonText(t, target.reason),
              }
            : undefined
        }
      >
        {isWeighted ? (
          <LiveSetTable
            session={session}
            exerciseIndex={exerciseIndex}
            entry={props.entry}
            toStartNext={props.toStartNext}
            editingRowRef={props.editingRowRef}
          />
        ) : (
          <RecordedExerciseView
            session={session}
            exerciseIndex={exerciseIndex}
            updateSession={updateSession}
            isActiveWorkout
            toStartNext={props.toStartNext}
            variant="focus"
          />
        )}
      </FocusExerciseCard>
      <RecordedExerciseNotesEditor
        exerciseName={blueprint.name}
        onDismiss={() => setNotesOpen(false)}
        open={notesOpen}
        notes={exercise.notes}
        onUpdateNotes={(notes) =>
          updateSession((s) => {
            const current = s.recordedExercises[exerciseIndex];
            return current ? s.withExercise(exerciseIndex, withNotes(current, notes)) : s;
          })
        }
      />
      <ConfirmationDialog
        headline={t('exercise.remove.confirm.title')}
        textContent={t('exercise.remove.confirm.body')}
        okText={t('generic.remove.button')}
        open={removeOpen}
        onOk={() => {
          setRemoveOpen(false);
          updateSession((s) => s.withRemovedExercise(exerciseIndex));
        }}
        onCancel={() => setRemoveOpen(false)}
        preventCancel={false}
      />
    </>
  );
}

function withNotes(exercise: RecordedExercise, notes: string): RecordedExercise {
  return exercise instanceof RecordedWeightedExercise ? exercise.with({ notes }) : exercise.with({ notes });
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function workingSetsText(t: ReturnType<typeof useTranslate>['t'], count: number): string {
  return count === 1
    ? t('live_workout.meta.working_sets_one.label')
    : t('live_workout.meta.working_sets.label', { count });
}
