import PotentialSetCounter from '@/components/presentation/workout/weighted/potential-set-counter';
import { spacing } from '@/hooks/useAppTheme';
import { RecordedWeightedExercise } from '@/models/session-models';
import { useState } from 'react';
import { View } from 'react-native';
import ExerciseSection from '@/components/presentation/workout/exercise-section';
import { OffsetDateTime } from '@js-joda/core';
import { Updater } from '@/utils/types';
import { SetPosition } from '@/models/session-models/recorded-weighted-exercise';
import { warmupTileFor } from '@/components/presentation/workout/weighted/warmup-tile';

interface WeightedExerciseProps {
  recordedExercise: RecordedWeightedExercise;
  previousRecordedExercises: RecordedWeightedExercise[];
  toStartNext: boolean;
  isReadonly: boolean;
  /** The Log RPE setting. Off still shows RPE already logged, it just stops offering to enter it. */
  rpeEnabled: boolean;
  showPreviousButton: boolean;
  /** See {@link ExerciseSection}'s `variant`. */
  variant?: 'list' | 'focus';

  timeProvider: () => OffsetDateTime;
  updateExercise: (update: Updater<RecordedWeightedExercise>) => void;
  resetSetTimer: () => void;
  onEditExercise: (() => void) | undefined;
  onRemoveExercise: () => void;
}

export default function WeightedExercise(props: WeightedExerciseProps) {
  const { updateExercise, timeProvider, resetSetTimer } = props;
  const { recordedExercise } = props;
  useState(false);

  const setToStartNext = props.toStartNext && !props.isReadonly ? recordedExercise.currentSet : undefined;
  const previous = recordedExercise.previousPerformanceIn(props.previousRecordedExercises);
  // Only a tap that fills or clears a set moves the rest timer; stepping the reps down keeps it.
  const tap = (position: SetPosition, update: Updater<RecordedWeightedExercise>) => {
    const wasLogged = !!recordedExercise.slotAt(position)?.set;
    const isLogged = !!update(recordedExercise).slotAt(position)?.set;
    updateExercise(update);
    if (!wasLogged || !isLogged) {
      resetSetTimer();
    }
  };
  const canEditRpe = props.rpeEnabled && !props.isReadonly;
  // A read-only view shows only what was logged; the live workout also shows an RPE picked ahead of the set.
  const rpeFor = (index: number) =>
    props.isReadonly ? recordedExercise.getSet(index).loggedRpe : recordedExercise.getSet(index).rpe;
  const showRpe = canEditRpe || recordedExercise.potentialSets.some((_, index) => rpeFor(index) !== undefined);

  return (
    <ExerciseSection
      recordedExercise={props.recordedExercise}
      previousRecordedExercises={props.previousRecordedExercises}
      toStartNext={props.toStartNext}
      isReadonly={props.isReadonly}
      showPreviousButton={props.showPreviousButton}
      variant={props.variant}
      updateExercise={props.updateExercise}
      onEditExercise={props.onEditExercise}
      onRemoveExercise={props.onRemoveExercise}
    >
      <View style={{ flexDirection: 'row', gap: spacing[2], flexWrap: 'wrap' }}>
        {recordedExercise.warmupSets.map((set, index) => (
          <PotentialSetCounter
            isReadonly={props.isReadonly}
            key={`warmup-${index}`}
            repsTarget={set.target}
            onTap={() => {
              const time = timeProvider();
              tap({ list: 'warmup', index }, (ex) => ex.withCycledWarmupRepCount(index, time));
            }}
            previousRepCount={undefined}
            onUpdateReps={(reps) => {
              updateExercise((ex) => ex.withWarmupRepCount(index, reps, timeProvider()));
              resetSetTimer();
            }}
            onUpdateWeight={(w) => updateExercise((ex) => ex.withWarmupWeight(index, w))}
            set={set}
            showRpe={false}
            rpe={undefined}
            onUpdateRpe={undefined}
            toStartNext={setToStartNext?.list === 'warmup' && setToStartNext.index === index}
            resistance={recordedExercise.blueprint.resistance}
            weightIncrement={recordedExercise.blueprint.weightIncrement}
            warmup={warmupTileFor(recordedExercise, index, previous)}
          />
        ))}
        {recordedExercise.potentialSets.map((set, index) => (
          <PotentialSetCounter
            isReadonly={props.isReadonly}
            key={index}
            repsTarget={recordedExercise.repsTargetForSet(index)}
            onTap={() => {
              const time = timeProvider();
              tap({ list: 'working', index }, (ex) => ex.withCycledRepCount(index, time));
            }}
            previousRepCount={previous?.potentialSets[index]?.set?.repsCompleted}
            onUpdateReps={(reps) => {
              updateExercise((ex) => ex.withRepCount(index, reps, timeProvider()));
              resetSetTimer();
            }}
            onUpdateWeight={(w, applyTo) => updateExercise((ex) => ex.withWeight(index, w, applyTo))}
            set={set}
            showRpe={showRpe}
            rpe={rpeFor(index)}
            onUpdateRpe={canEditRpe ? (rpe) => updateExercise((ex) => ex.withRpe(index, rpe)) : undefined}
            toStartNext={setToStartNext?.list === 'working' && setToStartNext.index === index}
            resistance={recordedExercise.blueprint.resistance}
            weightIncrement={recordedExercise.blueprint.weightIncrement}
          />
        ))}
      </View>
    </ExerciseSection>
  );
}
