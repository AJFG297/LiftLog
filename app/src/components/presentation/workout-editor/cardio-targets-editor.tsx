import { haptics } from '@/components/presentation/foundation/haptics';
import { MsIconSrc } from '@/components/presentation/foundation/ms-icon-source';
import { SegmentedControl } from '@/components/presentation/foundation/segmented-control';
import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { MIN_TOUCH_TARGET } from '@/components/presentation/foundation/touch-target';
import {
  ALSO_LOG_FIELDS,
  AlsoLogField,
  alsoLogOf,
  CardioDistanceUnit,
  CardioGoal,
  cardioGoalOf,
  CardioPad,
  CardioPadAction,
  CardioPadField,
  cardioPadReducer,
  CardioRoundsMode,
  cardioUnitOf,
  cardioValueTextOf,
  DISTANCE_CHIPS,
  MINUTE_CHIPS,
  nextCardioField,
} from '@/components/presentation/workout-editor/cardio-targets';
import { TargetsNumberPad, TargetsPadChip } from '@/components/presentation/workout-editor/targets-number-pad';
import { ModePill, Tile, TileValue } from '@/components/presentation/workout-editor/weighted-targets-editor';
import { spacing, useAppTheme } from '@/hooks/useAppTheme';
import { CardioExerciseBlueprint, ExerciseBlueprint } from '@/models/blueprint-models';
import { useTranslate } from '@tolgee/react';
import { useState } from 'react';
import { Keyboard, Pressable, StyleSheet, View } from 'react-native';

/** The cardio Targets card's number pad, held by the sheet so the pad can sit under the scrolling cards. */
export interface CardioPadControl {
  pad: CardioPad | undefined;
  distanceUnit: CardioDistanceUnit;
  dispatch: (action: CardioPadAction) => void;
}

export function useCardioTargetsPad(
  exercise: ExerciseBlueprint,
  update: (update: (exercise: ExerciseBlueprint) => ExerciseBlueprint) => void,
  distanceUnit: CardioDistanceUnit,
): CardioPadControl {
  const [pad, setPad] = useState<CardioPad>();
  const cardio = exercise instanceof CardioExerciseBlueprint ? exercise : undefined;
  return {
    pad: cardio && pad,
    distanceUnit,
    dispatch: (action) => {
      if (!cardio) {
        setPad(undefined);
        return;
      }
      if (action.type === 'open') {
        // The pad stands in for the keyboard, so a notes field typing at the same time gives way.
        Keyboard.dismiss();
      }
      const next = cardioPadReducer({ exercise: cardio, pad }, action);
      setPad(next.pad);
      if (next.exercise !== cardio) {
        update(() => next.exercise);
      }
    },
  };
}

const GOALS: { goal: CardioGoal; key: 'goal_time' | 'goal_distance' }[] = [
  { goal: 'time', key: 'goal_time' },
  { goal: 'distance', key: 'goal_distance' },
];

/**
 * The Time & distance targets (PM-51): a Time or Distance goal, Same each round with the Rounds and goal
 * tiles or Different each round with a list of rounds, each opening the number pad, then Also log.
 */
export function CardioTargetsEditor(props: {
  exercise: CardioExerciseBlueprint;
  mode: CardioRoundsMode;
  onModeChange: (mode: CardioRoundsMode) => void;
  onGoalChange: (goal: CardioGoal) => void;
  onAddRound: () => void;
  onRemoveRound: (index: number) => void;
  onAlsoLogChange: (field: AlsoLogField, on: boolean) => void;
  targets: CardioPadControl;
}) {
  const { t } = useTranslate();
  const { tokens } = useAppTheme();
  const { exercise, mode, targets } = props;
  const goal = cardioGoalOf(exercise);
  const open = (field: CardioPadField) => targets.dispatch({ type: 'open', field, distanceUnit: targets.distanceUnit });

  return (
    <View>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={t('exercise_editor.cardio.goal.label')}
        style={{ flexDirection: 'row', gap: 6, paddingHorizontal: spacing[4], paddingTop: 14 }}
      >
        {GOALS.map((option) => (
          <ModePill
            key={option.goal}
            label={t(`exercise_editor.cardio.${option.key}.label`)}
            selected={goal === option.goal}
            onPress={() => props.onGoalChange(option.goal)}
            testID={`cardio-goal-${option.goal}`}
          />
        ))}
      </View>
      <SegmentedControl
        testID="cardio-rounds-mode"
        accessibilityLabel={t('exercise_editor.cardio.rounds_mode.label')}
        value={mode}
        onChange={props.onModeChange}
        style={{ marginHorizontal: spacing[4], marginTop: 10 }}
        options={[
          { value: 'same', label: t('exercise_editor.cardio.same.label') },
          { value: 'each', label: t('exercise_editor.cardio.each.label') },
        ]}
      />
      {mode === 'each' ? (
        <RoundList {...props} openRound={(index) => open({ kind: 'round', index })} />
      ) : (
        <SameTiles exercise={exercise} targets={targets} open={open} />
      )}
      <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: tokens.line }} />
      <AlsoLog exercise={exercise} onChange={props.onAlsoLogChange} />
    </View>
  );
}

/** What a round shows: what is on the pad while it is being typed, otherwise its target. */
function shownValue(
  exercise: CardioExerciseBlueprint,
  pad: CardioPad | undefined,
  index: number,
  unit: CardioDistanceUnit,
) {
  const editing =
    pad?.field.kind === 'goal' || (pad?.field.kind === 'round' && pad.field.index === index) ? pad : undefined;
  return editing ? editing.text || '0' : cardioValueTextOf(exercise.sets[index]!.target, unit);
}

function SameTiles(props: {
  exercise: CardioExerciseBlueprint;
  targets: CardioPadControl;
  open: (field: CardioPadField) => void;
}) {
  const { t } = useTranslate();
  const { tokens } = useAppTheme();
  const { exercise, targets } = props;
  const { pad, distanceUnit } = targets;
  const goal = cardioGoalOf(exercise);
  const unit = cardioUnitOf(t, goal, distanceUnit);
  const rounds = pad?.field.kind === 'rounds' ? pad.text || '0' : String(exercise.sets.length);
  const value = shownValue(exercise, pad, 0, distanceUnit);
  const goalLabel = t(`exercise_editor.cardio.${goal === 'time' ? 'goal_time' : 'goal_distance'}.label`);
  return (
    <View style={{ flexDirection: 'row', gap: 10, padding: spacing[4], paddingTop: 14 }}>
      <Tile
        testID="cardio-rounds"
        label={t('exercise_editor.cardio.rounds.label')}
        accessibilityLabel={t('exercise_editor.cardio.rounds.accessibility_label', { rounds })}
        active={pad?.field.kind === 'rounds'}
        onPress={() => props.open({ kind: 'rounds' })}
      >
        <TileValue text={rounds} />
      </Tile>
      <Tile
        testID="cardio-goal"
        label={goalLabel}
        accessibilityLabel={t('exercise_editor.cardio.goal_tile.accessibility_label', { goal: goalLabel, value, unit })}
        active={pad?.field.kind === 'goal'}
        onPress={() => props.open({ kind: 'goal' })}
      >
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing[1] }}>
          <TileValue text={value} />
          <SurfaceText numeric font="text-base" style={{ color: tokens.muted }}>
            {unit}
          </SurfaceText>
        </View>
      </Tile>
    </View>
  );
}

function RoundList(props: {
  exercise: CardioExerciseBlueprint;
  targets: CardioPadControl;
  openRound: (index: number) => void;
  onAddRound: () => void;
  onRemoveRound: (index: number) => void;
}) {
  const { t } = useTranslate();
  const { tokens } = useAppTheme();
  const { exercise, targets } = props;
  const { pad, distanceUnit } = targets;
  const canRemove = exercise.sets.length > 1;
  return (
    <View style={{ paddingTop: spacing[2], paddingBottom: spacing[1] }}>
      {exercise.sets.map((set, index) => {
        const active = pad?.field.kind === 'round' && pad.field.index === index;
        const value = shownValue(exercise, pad, index, distanceUnit);
        const unit = cardioUnitOf(t, set.target.type, distanceUnit);
        const number = index + 1;
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
              testID={`cardio-round-${index}`}
              onPress={() => props.openRound(index)}
              accessibilityRole="button"
              accessibilityLabel={t('exercise_editor.cardio.round.accessibility_label', { number, value, unit })}
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
                    {number}
                  </SurfaceText>
                </View>
                <SurfaceText font="text-base" style={{ color: tokens.ink }}>
                  {t('exercise_editor.cardio.round.label', { number })}
                </SurfaceText>
              </View>
              <SurfaceText numeric font="text-lg" style={{ color: tokens.ink }}>
                {value}{' '}
                <SurfaceText font="text-sm" style={{ color: tokens.muted }}>
                  {unit}
                </SurfaceText>
              </SurfaceText>
            </Pressable>
            <Pressable
              testID={`cardio-remove-round-${index}`}
              onPress={() => props.onRemoveRound(index)}
              disabled={!canRemove}
              accessibilityRole="button"
              accessibilityLabel={t('exercise_editor.cardio.remove_round.accessibility_label', { number })}
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
        testID="cardio-add-round"
        onPress={props.onAddRound}
        accessibilityRole="button"
        accessibilityLabel={t('exercise_editor.cardio.add_round.button')}
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
          {t('exercise_editor.cardio.add_round.button')}
        </SurfaceText>
      </Pressable>
    </View>
  );
}

/** "Also log": what each round records besides its goal, which is always recorded. */
function AlsoLog(props: { exercise: CardioExerciseBlueprint; onChange: (field: AlsoLogField, on: boolean) => void }) {
  const { t } = useTranslate();
  const { tokens } = useAppTheme();
  const logged = alsoLogOf(props.exercise);
  return (
    <View style={{ paddingHorizontal: spacing[4], paddingTop: 14, paddingBottom: spacing[4], gap: 10 }}>
      <SurfaceText font="text-sm" style={{ color: tokens.muted }}>
        {t('exercise_editor.cardio.also_log.label')}
      </SurfaceText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
        {ALSO_LOG_FIELDS.map((field) => {
          const { on, locked } = logged[field];
          const name = t(`exercise_editor.cardio.also_log.${field}.label`);
          const label = locked
            ? t('exercise_editor.cardio.also_log.goal.label', { field: name })
            : t(`exercise_editor.cardio.also_log.${on ? 'on' : 'off'}.label`, { field: name });
          return (
            <Pressable
              key={field}
              testID={`cardio-also-log-${field}`}
              onPress={() => {
                if (!locked) {
                  haptics.selection();
                  props.onChange(field, !on);
                }
              }}
              disabled={locked}
              accessibilityRole="togglebutton"
              accessibilityLabel={locked ? label : name}
              accessibilityState={{ checked: on, disabled: locked }}
              style={{ minHeight: MIN_TOUCH_TARGET, justifyContent: 'center' }}
            >
              {({ pressed }) => (
                <View
                  style={{
                    height: 36,
                    paddingHorizontal: 14,
                    borderRadius: 18,
                    borderWidth: 1,
                    justifyContent: 'center',
                    borderColor: locked ? tokens.line : on ? tokens.ink : tokens.line,
                    backgroundColor: locked ? tokens.segment : on ? tokens.ink : pressed ? tokens.track : 'transparent',
                  }}
                >
                  <SurfaceText font="text-sm" style={{ color: locked ? tokens.muted : on ? tokens.bg : tokens.ink }}>
                    {label}
                  </SurfaceText>
                </View>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** The number pad for the cardio Targets card, mounted by the sheet under its scrolling cards. */
export function CardioTargetsPad(props: {
  exercise: CardioExerciseBlueprint;
  targets: CardioPadControl;
  /** Whether the How it runs card shows Rest between rounds, which Next after the last field points to. */
  restBetweenRounds: boolean;
}) {
  const { t } = useTranslate();
  const { exercise } = props;
  const { pad, dispatch, distanceUnit } = props.targets;
  if (!pad) {
    return null;
  }
  const { field, measure } = pad;
  const unit = measure === 'count' ? '' : cardioUnitOf(t, measure, distanceUnit);
  const distance = measure === 'distance';

  const chip = (text: string, selected: boolean): TargetsPadChip => ({
    label: `${text} ${unit}`,
    selected,
    accessibilityLabel: t('exercise_editor.pad.chip.accessibility_label', { value: text, unit }),
    onPress: () => dispatch({ type: 'chip', text }),
  });
  const chips =
    measure === 'time'
      ? MINUTE_CHIPS.map((m) => chip(String(m), pad.text === String(m)))
      : distance
        ? DISTANCE_CHIPS[distanceUnit].map((d) => chip(d, Number(pad.text) === Number(d)))
        : [];

  const label =
    field.kind === 'rounds'
      ? t('exercise_editor.cardio.rounds.label')
      : field.kind === 'goal'
        ? distance
          ? t('exercise_editor.pad.distance.label', { unit })
          : t('exercise_editor.pad.minutes.label')
        : distance
          ? t('exercise_editor.pad.round_distance.label', { number: field.index + 1, unit })
          : t('exercise_editor.pad.round_minutes.label', { number: field.index + 1 });

  const next = nextCardioField(pad, exercise);
  const goal = cardioGoalOf(exercise);
  const nextLabel =
    next === undefined
      ? props.restBetweenRounds
        ? t('exercise_editor.pad.next_rest.button')
        : undefined
      : next.kind === 'round'
        ? t('exercise_editor.pad.next_round.button', { number: next.index + 1 })
        : t(goal === 'time' ? 'exercise_editor.pad.next_time.button' : 'exercise_editor.pad.next_distance.button');

  return (
    <TargetsNumberPad
      label={label}
      display={[{ text: pad.text || '0' }, ...(unit ? [{ text: unit, unit: true }] : [])]}
      chips={chips}
      thirdKey={
        distance
          ? {
              label: '.',
              accessibilityLabel: t('exercise_editor.pad.decimal.accessibility_label'),
              enabled: pad.fresh || !pad.text.includes('.'),
              onPress: () => dispatch({ type: 'decimal' }),
            }
          : undefined
      }
      onDigit={(digit) => dispatch({ type: 'digit', digit })}
      onBackspace={() => dispatch({ type: 'backspace' })}
      onStep={(by) => dispatch({ type: 'step', by })}
      stepLabels={
        distance
          ? {
              minus: t('exercise_editor.pad.minus_half.accessibility_label'),
              plus: t('exercise_editor.pad.plus_half.accessibility_label'),
            }
          : undefined
      }
      next={nextLabel === undefined ? undefined : { label: nextLabel, onPress: () => dispatch({ type: 'next' }) }}
      onDone={() => dispatch({ type: 'close' })}
    />
  );
}
