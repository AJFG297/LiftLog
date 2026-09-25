import Button from '@/components/presentation/foundation/button';
import { IntegerEditor } from '@/components/presentation/foundation/editors/integer-editor';
import WeightDisplay from '@/components/presentation/foundation/editors/weight-display';
import IconButton from '@/components/presentation/foundation/icon-button';
import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { WarmupBadge } from '@/components/presentation/workout/warmup-badge';
import { spacing } from '@/hooks/useAppTheme';
import { usePreferredWeightUnit } from '@/hooks/usePreferredWeightUnit';
import {
  nextWarmupSet,
  PlannedWarmupSet,
  warmupIncrementFor,
  warmupLoadTypesFor,
  WeightedExerciseBlueprint,
  withWarmupLoadType,
} from '@/models/blueprint-models';
import { shortFormatWeightUnit } from '@/models/weight';
import { useTranslate } from '@tolgee/react';
import { View } from 'react-native';
import { Text, TextInput } from 'react-native-paper';

/**
 * The planned warm-ups, above the working sets. Empty, it is only an "Add warm-up" button so the
 * editor stays compact for the many exercises that never have any.
 */
export function WarmupSetsEditor({
  exercise,
  updateWarmupSets,
}: {
  exercise: WeightedExerciseBlueprint;
  updateWarmupSets: (warmupSets: PlannedWarmupSet[]) => void;
}) {
  const { t } = useTranslate();
  const warmups = exercise.warmupSets;

  const addWarmup = () => updateWarmupSets([...warmups, nextWarmupSet(exercise.resistance, warmups)]);
  const setWarmup = (index: number, warmup: PlannedWarmupSet) =>
    updateWarmupSets(warmups.map((w, i) => (i === index ? warmup : w)));
  const removeWarmup = (index: number) => updateWarmupSets(warmups.filter((_, i) => i !== index));

  return (
    <View style={{ gap: spacing[2] }} testID="exercise-warmup-sets">
      {warmups.length > 0 && (
        <SurfaceText font="text-lg" weight="bold">
          {t('exercise.warmup_sets.label')}
        </SurfaceText>
      )}
      {warmups.map((warmup, index) => (
        <WarmupSetRow
          key={index}
          exercise={exercise}
          warmup={warmup}
          index={index}
          onChange={(next) => setWarmup(index, next)}
          onRemove={() => removeWarmup(index)}
        />
      ))}
      <View style={{ alignItems: 'flex-start' }}>
        <Button mode="text" icon="add" onPress={addWarmup} testID="exercise-add-warmup">
          {t('exercise.warmup_sets.add.button')}
        </Button>
      </View>
    </View>
  );
}

function WarmupSetRow({
  exercise,
  warmup,
  index,
  onChange,
  onRemove,
}: {
  exercise: WeightedExerciseBlueprint;
  warmup: PlannedWarmupSet;
  index: number;
  onChange: (warmup: PlannedWarmupSet) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslate();
  const preferredUnit = usePreferredWeightUnit();
  const loadTypes = warmupLoadTypesFor(exercise.resistance);
  // A warm-up with no load reads as an empty fixed weight wherever a weight is allowed at all.
  const loadType = warmup.load?.type ?? 'absolute';
  const absoluteWeight = warmup.load?.type === 'absolute' ? warmup.load.weight : undefined;

  return (
    <View testID={`exercise-warmup-${index}`} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
      <WarmupBadge />

      {loadTypes.length > 1 && (
        <IconButton
          mode="outlined"
          testID="warmup-load-type"
          accessibilityLabel={t('exercise.warmup_sets.load_type.button')}
          icon={() => (
            <Text>
              {loadType === 'percent'
                ? t('exercise.warmup_sets.percent.label')
                : shortFormatWeightUnit(absoluteWeight?.unit ?? preferredUnit)}
            </Text>
          )}
          onPress={() => onChange(withWarmupLoadType(warmup, loadType === 'percent' ? 'absolute' : 'percent'))}
        />
      )}

      {loadTypes.length > 0 && (
        <View style={{ flex: 1 }}>
          {warmup.load?.type === 'percent' ? (
            <IntegerEditor
              mode="outlined"
              dense
              testID="warmup-percent"
              label={t('exercise.warmup_sets.percent_value.label')}
              value={warmup.load.percent}
              onChange={(percent) =>
                onChange({ ...warmup, load: { type: 'percent', percent: Math.min(Math.max(percent, 0), 100) } })
              }
              right={<TextInput.Affix text={t('exercise.warmup_sets.percent.label')} />}
            />
          ) : (
            <WeightDisplay
              allowNull
              weight={absoluteWeight}
              increment={warmupIncrementFor(exercise, absoluteWeight?.unit ?? preferredUnit)}
              label={t('exercise.warmup_sets.weight.label')}
              updateWeight={(weight) =>
                onChange({ ...warmup, load: weight ? { type: 'absolute', weight } : undefined })
              }
            />
          )}
        </View>
      )}

      <View style={{ flex: 1 }}>
        <IntegerEditor
          mode="outlined"
          dense
          testID="warmup-reps"
          label={t('exercise.warmup_sets.reps.label')}
          value={warmup.reps}
          onChange={(reps) => onChange({ ...warmup, reps: Math.max(reps, 1) })}
        />
      </View>

      <IconButton
        icon="close"
        testID="warmup-remove"
        accessibilityLabel={t('exercise.warmup_sets.remove.button')}
        onPress={onRemove}
      />
    </View>
  );
}
