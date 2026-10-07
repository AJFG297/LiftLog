import FixedIncrementer from '@/components/presentation/foundation/editors/fixed-incrementer';
import SegmentedPicker from '@/components/presentation/foundation/segmented-picker';
import { spacing } from '@/hooks/useAppTheme';
import { RepsConfig, RepsType, uniformTarget, WeightedExerciseBlueprint } from '@/models/blueprint-models';
import { setLabels, type WorkingListKind } from '@/models/session-models/set-kind';
import { ExtractType } from '@/utils/extract-type';
import { useTranslate } from '@tolgee/react';
import { useState } from 'react';
import { View } from 'react-native';

/**
 * The working sets' targets: Fixed, Range or Per set, then sets and reps on steppers. The edit exercise
 * sheet's Targets card holds it until the number pad takes over (PM-45).
 */
export function WeightedTargetsEditor({
  exercise,
  updateExercise,
}: {
  exercise: WeightedExerciseBlueprint;
  updateExercise: (exercise: WeightedExerciseBlueprint) => void;
}) {
  const { t } = useTranslate();

  // Only the targets persist, so a uniform list cannot say whether it was authored as fixed or as a
  // range; the chosen mode lives here for as long as the editor is open.
  const [mode, setMode] = useState<RepsType>(() => initialMode(exercise));
  const repsConfig = repsConfigFor(exercise, mode);

  const setRepsConfig = (next: RepsConfig) => {
    updateExercise(exercise.with({ sets: exercise.plannedSets.length, repsConfig: next }));
  };

  const changeMode = (next: RepsType) => {
    if (next === mode) {
      return;
    }
    setMode(next);
    setRepsConfig(seedRepsConfig(exercise, next));
  };

  return (
    <View style={{ gap: spacing[2] }}>
      <SegmentedPicker
        value={mode}
        options={[
          { value: 'fixed', label: 'Fixed', testID: 'reps-mode-fixed' },
          { value: 'range', label: 'Range', testID: 'reps-mode-range' },
          { value: 'perSet', label: 'Per set', testID: 'reps-mode-per-set' },
        ]}
        onChange={changeMode}
      />

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-start',
          width: '100%',
          gap: spacing[4],
        }}
      >
        <View style={{ flex: 1 }}>
          <FixedIncrementer
            label={t('exercise.sets.label')}
            onValueChange={(value) => updateExercise(exercise.withSets(value))}
            value={exercise.plannedSets.length}
            testID="exercise-sets"
          />
        </View>
        {repsConfig.type === 'perSet' ? (
          <PerSetRepsEditor
            repsConfig={repsConfig}
            setRepsConfig={setRepsConfig}
            kinds={exercise.plannedSets.map((set) => set.kind)}
          />
        ) : repsConfig.type === 'range' ? (
          <RangeRepsEditor repsConfig={repsConfig} setRepsConfig={setRepsConfig} />
        ) : (
          <FixedRepsEditor repsConfig={repsConfig} setRepsConfig={setRepsConfig} />
        )}
      </View>
    </View>
  );
}

function RangeRepsEditor({
  repsConfig,
  setRepsConfig,
}: {
  repsConfig: ExtractType<RepsConfig, 'range'>;
  setRepsConfig: (config: RepsConfig) => void;
}) {
  const { t } = useTranslate();
  return (
    <>
      <View style={{ flex: 1 }}>
        <FixedIncrementer
          label={t('exercise.min_reps.label')}
          onValueChange={(min) =>
            setRepsConfig({ ...repsConfig, min: Math.max(min, 1), max: Math.max(repsConfig.max, min) })
          }
          value={repsConfig.min}
          testID="exercise-min-reps"
        />
      </View>
      <View style={{ flex: 1 }}>
        <FixedIncrementer
          label={t('exercise.max_reps.label')}
          onValueChange={(max) => setRepsConfig({ ...repsConfig, max: Math.max(max, repsConfig.min) })}
          value={repsConfig.max}
          testID="exercise-max-reps"
        />
      </View>
    </>
  );
}

function FixedRepsEditor({
  repsConfig,
  setRepsConfig,
}: {
  repsConfig: ExtractType<RepsConfig, 'fixed'>;
  setRepsConfig: (config: RepsConfig) => void;
}) {
  const { t } = useTranslate();
  return (
    <View style={{ flex: 1 }}>
      <FixedIncrementer
        label={t('exercise.reps.label')}
        onValueChange={(reps) => setRepsConfig({ ...repsConfig, reps: Math.max(reps, 1) })}
        value={repsConfig.reps}
        testID="exercise-reps"
      />
    </View>
  );
}

function PerSetRepsEditor({
  repsConfig,
  setRepsConfig,
  kinds,
}: {
  repsConfig: ExtractType<RepsConfig, 'perSet'>;
  setRepsConfig: (config: RepsConfig) => void;
  kinds: WorkingListKind[];
}) {
  const { t } = useTranslate();
  const labels = setLabels(repsConfig.targets.map((_, index) => kinds[index] ?? 'working'));

  const setSetReps = (index: number, value: number) => {
    const reps = Math.max(value, 1);
    setRepsConfig({
      type: 'perSet',
      targets: repsConfig.targets.map((target, i) => (i === index ? { min: reps, max: reps } : target)),
    });
  };

  return (
    <View style={{ flex: 3, flexDirection: 'row', flexWrap: 'wrap', gap: spacing[4] }}>
      {repsConfig.targets?.map((target, index) => (
        <View key={index} style={{ flexGrow: 1, flexBasis: '25%', minWidth: spacing[16] }}>
          <FixedIncrementer
            label={t('exercise.set_number.label', { number: labels[index] })}
            onValueChange={(value) => setSetReps(index, value)}
            value={target.max}
            testID={`exercise-set-reps-${index}`}
          />
        </View>
      ))}
    </View>
  );
}

/** The layout the stored targets most likely came from, used to seed the editor's mode. */
function initialMode(exercise: WeightedExerciseBlueprint): RepsType {
  const uniform = uniformTarget(exercise.plannedSets);
  if (!uniform) {
    return 'perSet';
  }
  return uniform.min === uniform.max ? 'fixed' : 'range';
}

function repsConfigFor(exercise: WeightedExerciseBlueprint, mode: RepsType): RepsConfig {
  const targets = exercise.plannedSets.map((s) => ({ ...s.reps }));
  const first = targets[0] ?? { min: 10, max: 10 };
  return mode === 'perSet'
    ? { type: 'perSet', targets }
    : mode === 'range'
      ? { type: 'range', min: first.min, max: first.max }
      : { type: 'fixed', reps: first.max };
}

function seedRepsConfig(exercise: WeightedExerciseBlueprint, mode: RepsType): RepsConfig {
  const target = exercise.repsTargetForSet(0);
  return mode === 'perSet'
    ? { type: 'perSet', targets: exercise.plannedSets.map(() => ({ min: target.max, max: target.max })) }
    : mode === 'range'
      ? { type: 'range', min: target.min, max: target.max }
      : { type: 'fixed', reps: target.min };
}
