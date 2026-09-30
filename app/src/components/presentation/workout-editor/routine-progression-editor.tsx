import { MsIconSrc } from '@/components/presentation/foundation/ms-icon-source';
import { SegmentedControl, type SegmentedOption } from '@/components/presentation/foundation/segmented-control';
import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { MIN_TOUCH_TARGET } from '@/components/presentation/foundation/touch-target';
import { ProgressionRulesEditor } from '@/components/presentation/workout-editor/progressive-overload';
import { RoutineCardSectionLabel } from '@/components/presentation/workout-editor/routine-exercise-card';
import {
  ladderCeilingFor,
  offersProgressionPresets,
  type ProgressionChoice,
  progressionChoiceOf,
  rulesForPreset,
  sharedWorkingTopReps,
} from '@/components/presentation/workout-editor/routine-progression';
import { spacing, useAppTheme } from '@/hooks/useAppTheme';
import { ProgressionRule, WeightedExerciseBlueprint } from '@/models/blueprint-models';
import BigNumber from 'bignumber.js';
import { useTranslate } from '@tolgee/react';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

interface RoutineProgressionEditorProps {
  exercise: WeightedExerciseBlueprint;
  /** The step a preset adds when the exercise has none yet, such as the equipment's. */
  fallbackStep: BigNumber;
  /** A weight step with its unit, "2.5 kg", for the explanation. */
  formatStep: (step: BigNumber) => string;
  onChange: (progression: ProgressionRule[]) => void;
}

/**
 * The progression choice: Add weight, Reps then weight, or Off, each explained with the exercise's own
 * numbers, and the full rule editor under Advanced for anything else.
 */
export function RoutineProgressionEditor(props: RoutineProgressionEditorProps) {
  const { t } = useTranslate();
  const { tokens } = useAppTheme();
  const { exercise } = props;
  const choice = progressionChoiceOf(exercise.progression);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const presets = offersProgressionPresets(exercise);

  const presetOptions: [
    SegmentedOption<ProgressionChoice>,
    SegmentedOption<ProgressionChoice>,
    SegmentedOption<ProgressionChoice>,
  ] = [
    { value: 'weight', label: t('routine_editor.progression.weight.label') },
    { value: 'double', label: t('routine_editor.progression.double.label') },
    { value: 'off', label: t('routine_editor.progression.off.label') },
  ];
  const options =
    choice === 'custom'
      ? ([...presetOptions, { value: 'custom', label: t('routine_editor.progression.custom.label') }] as const)
      : presetOptions;

  const pick = (next: ProgressionChoice) => {
    if (next !== 'custom') {
      props.onChange(rulesForPreset(next, exercise, props.fallbackStep));
    }
  };

  return (
    <View style={{ gap: spacing[2] }}>
      <RoutineCardSectionLabel>{t('routine_editor.progression.title')}</RoutineCardSectionLabel>
      {presets ? (
        <>
          <SegmentedControl
            options={options}
            value={choice}
            onChange={pick}
            accessibilityLabel={t('routine_editor.progression.title')}
            testID="routine-progression"
          />
          <SurfaceText font="text-sm" style={{ color: tokens.muted }}>
            {explanation(t, exercise, choice, props)}
          </SurfaceText>
        </>
      ) : null}
      <Pressable
        onPress={() => setAdvancedOpen((open) => !open)}
        accessibilityRole="button"
        accessibilityState={{ expanded: advancedOpen }}
        style={{ minHeight: MIN_TOUCH_TARGET, flexDirection: 'row', alignItems: 'center', gap: spacing[1] }}
      >
        <SurfaceText font="text-sm" weight="600" style={{ color: tokens.accentInk }}>
          {t('routine_editor.progression.advanced.button')}
        </SurfaceText>
        <View style={{ transform: [{ rotate: advancedOpen ? '180deg' : '0deg' }] }}>
          <MsIconSrc name="expandMore" size={18} color={tokens.accentInk} />
        </View>
      </Pressable>
      {advancedOpen || !presets ? <ProgressionRulesEditor exercise={exercise} onChange={props.onChange} /> : null}
    </View>
  );
}

type TranslateFn = ReturnType<typeof useTranslate>['t'];

function explanation(
  t: TranslateFn,
  exercise: WeightedExerciseBlueprint,
  choice: ProgressionChoice,
  props: RoutineProgressionEditorProps,
): string {
  const load = exercise.progression.find((rule) => rule.axis === 'load')?.step ?? props.fallbackStep;
  const step = props.formatStep(load);
  const reps = sharedWorkingTopReps(exercise);
  switch (choice) {
    case 'weight':
      return reps === undefined
        ? t('routine_editor.progression.weight.per_set_body', { step })
        : t('routine_editor.progression.weight.body', { reps, step });
    case 'double': {
      const to = ladderCeilingFor(exercise).toNumber();
      return reps === undefined
        ? t('routine_editor.progression.double.per_set_body', { to, step })
        : t('routine_editor.progression.double.body', { from: reps, to, step });
    }
    case 'off':
      return t('routine_editor.progression.off.body');
    case 'custom':
      return t('routine_editor.progression.custom.body');
  }
}

/** The short tag on a collapsed card, or undefined when progression is off. */
export function progressionTagOf(
  t: TranslateFn,
  exercise: WeightedExerciseBlueprint,
  formatStep: (step: BigNumber) => string,
  unitLabel: string,
): string | undefined {
  const choice = progressionChoiceOf(exercise.progression);
  switch (choice) {
    case 'off':
      return undefined;
    case 'weight':
      return `+${formatStep(exercise.progression[0]!.step)}`;
    case 'double':
      return t('routine_editor.progression.double.tag', { unit: unitLabel });
    case 'custom':
      return t('routine_editor.progression.custom.label');
  }
}
