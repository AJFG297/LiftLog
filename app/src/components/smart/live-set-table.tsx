import { setBadgeText, type SetBadgeProps } from '@/components/presentation/foundation/set-badge/set-badge-kinds';
import { formatWeightText } from '@/components/presentation/foundation/weight-format';
import { SetTable, type SetTableCell, type SetTableRow } from '@/components/presentation/live-workout/set-table';
import ExerciseNotesDisplay from '@/components/presentation/workout/exercise-notes-display';
import { spacing } from '@/hooks/useAppTheme';
import { LiveSetEntry } from '@/hooks/useLiveSetEntry';
import { usePreviousPerformance } from '@/hooks/useTodaysTarget';
import { Resistance } from '@/models/blueprint-models';
import { equipmentClassOf } from '@/models/equipment';
import { PotentialSet, RecordedWeightedExercise, Session } from '@/models/session-models';
import { SetPosition } from '@/models/session-models/recorded-weighted-exercise';
import { formatRpe } from '@/models/session-models/rpe';
import { SetField, SetRow, setRowsOf, weightUnitOf } from '@/models/session-models/set-entry';
import { LoadUnit, Weight } from '@/models/weight';
import { useAppSelector } from '@/store';
import { selectPreferredWeightUnit } from '@/store/settings';
import { selectExercises } from '@/store/stored-sessions';
import { localeDecimalSeparator, localeFormatBigNumber } from '@/utils/locale-bignumber';
import { useTranslate } from '@tolgee/react';
import BigNumber from 'bignumber.js';
import { type Ref } from 'react';
import { View } from 'react-native';

const NO_PREVIOUS = '-';

interface LiveSetTableProps {
  session: Session;
  exerciseIndex: number;
  entry: LiveSetEntry;
  /** Whether this exercise holds the page's next set, which the table outlines. */
  toStartNext: boolean;
  editingRowRef: Ref<View>;
}

/** A weighted exercise's sets on the focus page, wired to the number pad and the set-type sheet. */
export function LiveSetTable(props: LiveSetTableProps) {
  const { session, exerciseIndex, entry } = props;
  const { t } = useTranslate();
  const previousPerformance = usePreviousPerformance(session);
  const catalog = useAppSelector(selectExercises);
  const preferredUnit = useAppSelector(selectPreferredWeightUnit);
  const state = entry.stateFor(exerciseIndex);
  if (!state) {
    return null;
  }

  const { exercise } = state;
  const { resistance } = exercise.blueprint;
  const unit = weightUnitOf(exercise, preferredUnit);
  const perDumbbell = equipmentClassOf(catalog[exercise.blueprint.exerciseId]?.equipment ?? null) === 'dumbbell';
  const performances = previousPerformance(exercise);
  // A changed set scheme carries nothing on, but last time's numbers are still worth seeing.
  const previous = performances.previous ?? performances.candidates[0];
  const next = props.toStartNext ? exercise.currentSet : undefined;
  const editing = entry.editing?.exerciseIndex === exerciseIndex ? entry.editing : undefined;
  const bodyweightLabel = t('exercise.short_bodyweight.label');

  const cellFor = (row: SetRow, field: SetField, text: string, entered: boolean, label: string): SetTableCell => {
    const isEditing = !!editing && samePosition(editing.position, row.position) && editing.field === field;
    const typed =
      isEditing && entry.buffer.typed !== null ? entry.buffer.typed.replace('.', localeDecimalSeparator()) : undefined;
    return {
      text: typed ?? text,
      entered: entered || typed !== undefined,
      editing: isEditing,
      caret: isEditing ? (typed === undefined ? 'before' : 'after') : undefined,
      accessibilityLabel: label,
      onPress: () => entry.open(exerciseIndex, row.position, field),
    };
  };

  const rows: SetTableRow[] = setRowsOf(state).map((row) => {
    const badge = badgeFor(row);
    const set = setBadgeText(badge, t).accessibilityLabel;
    const rpe = row.position.list === 'working' ? row.slot.rpe : undefined;
    const spokenWeight = formatWeightText(row.weight.value, resistance === 'bodyweight', bodyweightLabel);
    const repsLabel = t(
      row.reps.entered ? 'live_workout.set_table.reps_value.label' : 'live_workout.set_table.reps_target.label',
      {
        set,
        reps: row.reps.value,
      },
    );
    return {
      key: `${row.position.list}-${row.position.index}`,
      badge,
      badgeAccessibilityLabel: t('live_workout.set_table.set_type.button', { set }),
      onPressBadge: () => entry.openSetType(exerciseIndex, row.position),
      previous: previousText(previousSlotAt(previous, row.position), resistance, unit, bodyweightLabel),
      weight:
        resistance === 'none'
          ? undefined
          : cellFor(
              row,
              'weight',
              loadText(row.weight.value, resistance, bodyweightLabel),
              row.weight.entered,
              t(
                row.weight.entered
                  ? 'live_workout.set_table.weight.label'
                  : 'live_workout.set_table.weight_target.label',
                {
                  set,
                  weight: spokenWeight,
                },
              ),
            ),
      reps: cellFor(
        row,
        'reps',
        String(row.reps.value),
        row.reps.entered,
        rpe === undefined
          ? repsLabel
          : `${repsLabel}, ${t('live_workout.set_table.rpe.label', { rpe: localeFormatBigNumber(new BigNumber(rpe)) })}`,
      ),
      rpe: rpe === undefined ? undefined : formatRpe(rpe),
      logged: row.logged,
      // The outline gives way to the edited field's while anything is being typed.
      isNext: !entry.editing && !!next && samePosition(next, row.position),
      checkAccessibilityLabel: t(
        row.logged ? 'live_workout.set_table.undo.button' : 'live_workout.set_table.log.button',
        {
          set,
        },
      ),
      onToggle: () => entry.toggle(exerciseIndex, row.position),
    };
  });

  return (
    <View style={{ gap: spacing[3] }}>
      <SetTable
        weightHeader={weightHeaderFor(t, unit, perDumbbell)}
        showsWeight={resistance !== 'none'}
        rows={rows}
        onAddSet={() => entry.addSet(exerciseIndex)}
        editingRowRef={props.editingRowRef}
      />
      <ExerciseNotesDisplay exercise={exercise} previousExercise={performances.candidates[0]} />
    </View>
  );
}

type TranslateFn = ReturnType<typeof useTranslate>['t'];

function weightHeaderFor(t: TranslateFn, unit: LoadUnit, perDumbbell: boolean): string {
  if (unit === 'pounds') {
    return perDumbbell ? t('live_workout.set_table.pounds_each.label') : t('live_workout.set_table.pounds.label');
  }
  return perDumbbell ? t('live_workout.set_table.kilograms_each.label') : t('live_workout.set_table.kilograms.label');
}

function badgeFor(row: SetRow): SetBadgeProps {
  const { kind } = row.slot;
  return kind === 'working' ? { kind, number: Number(row.label) } : { kind };
}

function previousSlotAt(
  previous: RecordedWeightedExercise | undefined,
  position: SetPosition,
): PotentialSet | undefined {
  return (position.list === 'warmup' ? previous?.warmupSets : previous?.potentialSets)?.[position.index];
}

/** "85 × 5", "BW × 12", or just the reps for a movement with no load. */
function previousText(slot: PotentialSet | undefined, resistance: Resistance, unit: LoadUnit, bodyweightLabel: string) {
  if (!slot?.set) {
    return NO_PREVIOUS;
  }
  const reps = slot.set.repsCompleted;
  if (resistance === 'none') {
    return String(reps);
  }
  // Only a weight in another unit than today's column needs its own.
  const load =
    slot.weight.unit === unit || slot.weight.unit === 'nil'
      ? loadText(slot.weight, resistance, bodyweightLabel)
      : formatWeightText(slot.weight, resistance === 'bodyweight', bodyweightLabel);
  return `${load} × ${reps}`;
}

/** A weight in the table, whose column already names the unit: `87.5`, or on bodyweight `BW`, `+10`. */
function loadText(weight: Weight, resistance: Resistance, bodyweightLabel: string): string {
  if (resistance !== 'bodyweight') {
    return localeFormatBigNumber(weight.value);
  }
  if (weight.value.isZero()) {
    return bodyweightLabel;
  }
  return `${weight.value.isGreaterThan(0) ? '+' : ''}${localeFormatBigNumber(weight.value)}`;
}

function samePosition(a: SetPosition, b: SetPosition): boolean {
  return a.list === b.list && a.index === b.index;
}
