import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { MIN_TOUCH_TARGET } from '@/components/presentation/foundation/touch-target';
import { MsIconSrc } from '@/components/presentation/foundation/ms-icon-source';
import {
  FIXED_REPS_CHIPS,
  nextTargetsField,
  RANGE_REPS_CHIPS,
  repsTextOf,
  TargetsField,
  TargetsMode,
  TargetsPad,
  TargetsPadAction,
  targetsPadReducer,
} from '@/components/presentation/workout-editor/exercise-targets';
import { ModePill } from '@/components/presentation/foundation/mode-pill';
import { Tile, TileValue } from '@/components/presentation/foundation/tile';
import { TargetsNumberPad, TargetsPadDisplayPart } from '@/components/presentation/workout-editor/targets-number-pad';
import { spacing, useAppTheme } from '@/hooks/useAppTheme';
import { ExerciseBlueprint, RepsTarget, WeightedExerciseBlueprint } from '@/models/blueprint-models';
import { setLabels } from '@/models/session-models/set-kind';
import { useTranslate } from '@tolgee/react';
import { useState } from 'react';
import { Keyboard, Pressable, View } from 'react-native';

/** The Targets card's number pad, held by the sheet so the pad can sit under the scrolling cards. */
export interface TargetsPadControl {
  pad: TargetsPad | undefined;
  dispatch: (action: TargetsPadAction) => void;
}

export function useTargetsPad(
  exercise: ExerciseBlueprint,
  update: (update: (exercise: ExerciseBlueprint) => ExerciseBlueprint) => void,
): TargetsPadControl {
  const [pad, setPad] = useState<TargetsPad>();
  const weighted = exercise instanceof WeightedExerciseBlueprint ? exercise : undefined;
  return {
    // Cardio has no pad of its own yet (PM-51), so switching tracking type hides it.
    pad: weighted && pad,
    dispatch: (action) => {
      if (!weighted) {
        setPad(undefined);
        return;
      }
      if (action.type === 'open') {
        // The pad stands in for the keyboard, so a notes field typing at the same time gives way.
        Keyboard.dismiss();
      }
      const next = targetsPadReducer({ exercise: weighted, pad }, action);
      setPad(next.pad);
      if (next.exercise !== weighted) {
        update(() => next.exercise);
      }
    },
  };
}

const MODES: { mode: TargetsMode; key: 'fixed' | 'range' | 'per_set' }[] = [
  { mode: 'fixed', key: 'fixed' },
  { mode: 'range', key: 'range' },
  { mode: 'perSet', key: 'per_set' },
];

/**
 * The working sets' targets (PM-45): Fixed, Range or Per set, then the Sets and Reps tiles, or a list of
 * sets, each opening the number pad.
 */
export function WeightedTargetsEditor(props: {
  exercise: WeightedExerciseBlueprint;
  mode: TargetsMode;
  onModeChange: (mode: TargetsMode) => void;
  targets: TargetsPadControl;
  onAddSet: () => void;
  onRemoveSet: (index: number) => void;
}) {
  const { t } = useTranslate();
  const { exercise, mode, targets } = props;
  const { pad, dispatch } = targets;
  const field = pad?.field;
  const open = (next: TargetsField) => dispatch({ type: 'open', field: next, mode });

  return (
    <View>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={t('exercise_editor.targets.mode.label')}
        style={{ flexDirection: 'row', gap: 6, paddingHorizontal: spacing[4], paddingTop: 14 }}
      >
        {MODES.map((option) => (
          <ModePill
            key={option.mode}
            label={t(`exercise_editor.targets.${option.key}.label`)}
            selected={mode === option.mode}
            onPress={() => props.onModeChange(option.mode)}
            testID={`reps-mode-${option.key}`}
          />
        ))}
      </View>
      {mode === 'perSet' ? (
        <PerSetList {...props} openSet={(index) => open({ kind: 'set', index })} />
      ) : (
        <View style={{ flexDirection: 'row', gap: 10, padding: spacing[4], paddingTop: 14 }}>
          <Tile
            testID="exercise-sets"
            label={t('exercise_editor.targets.sets.label')}
            accessibilityLabel={t('exercise_editor.targets.sets.accessibility_label', {
              sets: field?.kind === 'sets' ? pad!.value : exercise.plannedSets.length,
            })}
            active={field?.kind === 'sets'}
            onPress={() => open({ kind: 'sets' })}
          >
            <TileValue text={String(field?.kind === 'sets' ? pad!.value : exercise.plannedSets.length)} />
          </Tile>
          <RepsTile exercise={exercise} mode={mode} pad={pad} onPress={() => open({ kind: 'reps' })} />
        </View>
      )}
    </View>
  );
}

function RepsTile(props: {
  exercise: WeightedExerciseBlueprint;
  mode: TargetsMode;
  pad: TargetsPad | undefined;
  onPress: () => void;
}) {
  const { t } = useTranslate();
  const { tokens } = useAppTheme();
  const kind = props.pad?.field.kind;
  const active = kind === 'reps' || kind === 'bottom' || kind === 'top';
  const target = shownTarget(props.exercise, props.pad);
  const focus = (end: 'bottom' | 'top') =>
    kind === end ? { borderBottomWidth: 2, borderColor: tokens.accent } : undefined;
  return (
    <Tile
      testID="exercise-reps"
      label={t('exercise_editor.targets.reps.label')}
      accessibilityLabel={t('exercise_editor.targets.reps.accessibility_label', {
        reps: repsTextOf(target, props.mode),
      })}
      active={active}
      onPress={props.onPress}
    >
      {props.mode === 'range' ? (
        <View style={{ flexDirection: 'row' }}>
          <TileValue text={String(target.min)} style={focus('bottom')} />
          <TileValue text="–" />
          <TileValue text={String(target.max)} style={focus('top')} />
        </View>
      ) : (
        <TileValue text={String(target.max)} />
      )}
    </Tile>
  );
}

/** The first set's target, with the end being typed showing what is on the pad. */
function shownTarget(exercise: WeightedExerciseBlueprint, pad: TargetsPad | undefined): RepsTarget {
  const target = exercise.repsTargetForSet(0);
  switch (pad?.field.kind) {
    case 'reps':
      return { min: pad.value, max: pad.value };
    case 'bottom':
      return { ...target, min: pad.value };
    case 'top':
      return { ...target, max: pad.value };
    default:
      return target;
  }
}

function PerSetList(props: {
  exercise: WeightedExerciseBlueprint;
  targets: TargetsPadControl;
  openSet: (index: number) => void;
  onAddSet: () => void;
  onRemoveSet: (index: number) => void;
}) {
  const { t } = useTranslate();
  const { tokens } = useAppTheme();
  const { pad } = props.targets;
  const sets = props.exercise.plannedSets;
  const labels = setLabels(sets.map((s) => s.kind));
  const canRemove = sets.length > 1;
  return (
    <View style={{ paddingTop: spacing[2], paddingBottom: spacing[1] }}>
      {sets.map((set, index) => {
        const active = pad?.field.kind === 'set' && pad.field.index === index;
        const reps = active ? pad.value : set.reps.max;
        const label = labels[index] ?? String(index + 1);
        return (
          <View
            key={index}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              minHeight: 52,
              paddingLeft: spacing[4],
              paddingRight: spacing[2],
              gap: spacing[1],
            }}
          >
            <Pressable
              testID={`exercise-set-reps-${index}`}
              onPress={() => props.openSet(index)}
              accessibilityRole="button"
              accessibilityLabel={t('exercise_editor.targets.set.accessibility_label', { number: label, reps })}
              accessibilityState={{ selected: active }}
              style={{
                flex: 1,
                minHeight: 44,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderRadius: 10,
                borderWidth: 2,
                paddingLeft: active ? spacing[2] : 0,
                paddingRight: 10,
                borderColor: active ? tokens.accent : 'transparent',
                backgroundColor: active ? tokens.accentSoft : 'transparent',
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
                <View
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 8,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: tokens.segment,
                  }}
                >
                  <SurfaceText numeric font="text-sm" style={{ color: tokens.ink }}>
                    {label}
                  </SurfaceText>
                </View>
                <SurfaceText font="text-base" style={{ color: tokens.ink }}>
                  {t('exercise_editor.targets.set.label', { number: label })}
                </SurfaceText>
              </View>
              <SurfaceText numeric font="text-lg" style={{ color: tokens.ink }}>
                {reps}{' '}
                <SurfaceText font="text-sm" style={{ color: tokens.muted }}>
                  {t('exercise_editor.targets.reps_unit.label')}
                </SurfaceText>
              </SurfaceText>
            </Pressable>
            <Pressable
              testID={`exercise-remove-set-${index}`}
              onPress={() => props.onRemoveSet(index)}
              disabled={!canRemove}
              accessibilityRole="button"
              accessibilityLabel={t('exercise_editor.targets.remove_set.accessibility_label', { number: label })}
              accessibilityState={{ disabled: !canRemove }}
              style={{
                width: MIN_TOUCH_TARGET,
                height: MIN_TOUCH_TARGET,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: canRemove ? 1 : 0.3,
              }}
            >
              <MsIconSrc name="close" size={16} color={tokens.muted} />
            </Pressable>
          </View>
        );
      })}
      <Pressable
        testID="exercise-add-set"
        onPress={props.onAddSet}
        accessibilityRole="button"
        accessibilityLabel={t('exercise_editor.targets.add_set.button')}
        style={({ pressed }) => ({
          minHeight: MIN_TOUCH_TARGET,
          marginHorizontal: spacing[4],
          marginTop: spacing[1],
          marginBottom: spacing[3],
          borderRadius: 10,
          borderWidth: 1,
          borderStyle: 'dashed',
          borderColor: tokens.line,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: pressed ? tokens.track : 'transparent',
        })}
      >
        <SurfaceText font="text-sm" weight="500" style={{ color: tokens.accentInk }}>
          {t('exercise_editor.targets.add_set.button')}
        </SurfaceText>
      </Pressable>
    </View>
  );
}

/** The number pad for the Targets card, mounted by the sheet under its scrolling cards. */
export function WeightedTargetsPad(props: { exercise: WeightedExerciseBlueprint; targets: TargetsPadControl }) {
  const { t } = useTranslate();
  const { exercise } = props;
  const { pad, dispatch } = props.targets;
  if (!pad) {
    return null;
  }
  const { field } = pad;
  const inRange = field.kind === 'bottom' || field.kind === 'top';
  const target = shownTarget(exercise, pad);

  const end = (kind: 'bottom' | 'top'): TargetsPadDisplayPart => {
    const value = kind === 'bottom' ? target.min : target.max;
    return {
      text: String(value),
      pick: {
        active: field.kind === kind,
        accessibilityLabel: t(`exercise_editor.pad.${kind}.accessibility_label`, { reps: value }),
        onPress: () => dispatch({ type: 'pick', field: { kind } }),
      },
    };
  };
  const display: TargetsPadDisplayPart[] = inRange
    ? [end('bottom'), { text: '–', separator: true }, end('top')]
    : [{ text: String(pad.value) }];

  const fixedChip = (reps: number) => ({
    label: String(reps),
    selected: pad.value === reps,
    accessibilityLabel: t('exercise_editor.pad.reps_chip.accessibility_label', { reps }),
    onPress: () => dispatch({ type: 'chip', reps: { min: reps, max: reps } }),
  });
  const chips =
    field.kind === 'sets'
      ? []
      : inRange
        ? RANGE_REPS_CHIPS.map((reps) => ({
            label: `${reps.min}–${reps.max}`,
            selected: target.min === reps.min && target.max === reps.max,
            accessibilityLabel: t('exercise_editor.pad.range_chip.accessibility_label', {
              min: reps.min,
              max: reps.max,
            }),
            onPress: () => dispatch({ type: 'chip', reps }),
          }))
        : FIXED_REPS_CHIPS.map(fixedChip);

  const next = nextTargetsField(pad, exercise);
  const labels = setLabels(exercise.plannedSets.map((s) => s.kind));
  const setName = (index: number) => labels[index] ?? String(index + 1);
  const nextLabel =
    next === undefined
      ? t('exercise_editor.pad.next_rest.button')
      : next.kind === 'set'
        ? t('exercise_editor.pad.next_set.button', { number: setName(next.index) })
        : next.kind === 'top'
          ? t('exercise_editor.pad.next_top.button')
          : t('exercise_editor.pad.next_reps.button');
  const label =
    field.kind === 'sets'
      ? t('exercise_editor.targets.sets.label')
      : field.kind === 'bottom'
        ? t('exercise_editor.pad.bottom.label')
        : field.kind === 'top'
          ? t('exercise_editor.pad.top.label')
          : field.kind === 'set'
            ? t('exercise_editor.pad.set.label', { number: setName(field.index) })
            : t('exercise_editor.targets.reps.label');

  return (
    <TargetsNumberPad
      label={label}
      display={display}
      chips={chips}
      thirdKey={
        inRange
          ? {
              label: '–',
              accessibilityLabel: t('exercise_editor.pad.dash.accessibility_label'),
              enabled: field.kind === 'bottom',
              onPress: () => dispatch({ type: 'dash' }),
            }
          : undefined
      }
      onDigit={(digit) => dispatch({ type: 'digit', digit })}
      onBackspace={() => dispatch({ type: 'backspace' })}
      onStep={(by) => dispatch({ type: 'step', by })}
      next={{ label: nextLabel, onPress: () => dispatch({ type: 'next' }) }}
      onDone={() => dispatch({ type: 'close' })}
    />
  );
}
