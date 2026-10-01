import { Card } from '@/components/presentation/foundation/card';
import { MsIconSrc } from '@/components/presentation/foundation/ms-icon-source';
import {
  NumberPad,
  type NumberPadBuffer,
  type NumberPadField,
  numberPadReducer,
  numberPadValue,
  openNumberPad,
  weightAccessoryFor,
} from '@/components/presentation/foundation/number-pad';
import { setBadgeText, type SetBadgeProps } from '@/components/presentation/foundation/set-badge/set-badge-kinds';
import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { useToast } from '@/components/presentation/foundation/toast';
import { MIN_TOUCH_TARGET } from '@/components/presentation/foundation/touch-target';
import { ASK_AI_BAR_ENABLED, AskAiBar } from '@/components/presentation/workout-editor/ask-ai-bar';
import { formatCardioTarget } from '@/utils/format-cardio-target';
import { withPickAppended } from '@/components/presentation/workout-editor/exercise-picker';
import { RoutineColorSwatches } from '@/components/presentation/workout-editor/routine-color-swatches';
import { RoutineExerciseActions } from '@/components/presentation/workout-editor/routine-exercise-actions';
import {
  RoutineExerciseCard,
  RoutineSupersetHeader,
} from '@/components/presentation/workout-editor/routine-exercise-card';
import {
  canMoveExercise,
  canToggleSuperset,
  orderAfterMove,
  routineBlocksOf,
  routineExerciseLabel,
  supersetLetterOf,
  withExerciseMoved,
  withExerciseRemoved,
  withSupersetToggled,
  type MoveDirection,
} from '@/components/presentation/workout-editor/routine-order';
import {
  progressionTagOf,
  RoutineProgressionEditor,
} from '@/components/presentation/workout-editor/routine-progression-editor';
import { withLadderKeptClimbable } from '@/components/presentation/workout-editor/routine-progression';
import { RoutineRestEditor } from '@/components/presentation/workout-editor/routine-rest-editor';
import { RoutineSetTable, type RoutineSetTableRow } from '@/components/presentation/workout-editor/routine-set-table';
import {
  canRemoveRoutineSet,
  type RoutineSetPosition,
  type RoutineSetRow,
  routineSetRowsOf,
  withRoutineSetAdded,
  withRoutineSetRemoved,
  withRoutineSetReps,
  withWarmupLoad,
} from '@/components/presentation/workout-editor/routine-sets';
import { estimatedMinutesOf, totalSetsOf } from '@/components/presentation/workout-editor/routine-summary';
import { RoutineStartOptions } from '@/components/presentation/workout-editor/routine-start-options';
import {
  isRoutineDraftChanged,
  markRoutineDraftSaved,
  newExerciseKey,
  openRoutineDraft,
  routineDraftAt,
  type RoutineDraftLocation,
  setRoutineDraftExercises,
  updateRoutineDraft,
  useOwnedRoutineDraft,
} from '@/components/smart/routine-draft';
import { useServices } from '@/components/smart/services-provider';
import { fontFamily, spacing, useAppTheme } from '@/hooks/useAppTheme';
import { useBackWhenGone } from '@/hooks/useBackWhenGone';
import { type ExercisePick, useExercisePicker } from '@/hooks/useExerciseSearch';
import { useGoToRoutines } from '@/hooks/useGoToRoutines';
import {
  CardioExerciseBlueprint,
  ExerciseBlueprint,
  formatPlannedSets,
  formatRepsTarget,
  WeightedExerciseBlueprint,
} from '@/models/blueprint-models';
import { equipmentClassOf, weightStepFor } from '@/models/equipment';
import { routineColorOf, type RoutineColor } from '@/models/routine-color';
import { RecordedWeightedExercise } from '@/models/session-models';
import { setLabels } from '@/models/session-models/set-kind';
import { type LoadUnit, Weight } from '@/models/weight';
import { useAppSelector } from '@/store';
import { updateProgram } from '@/store/program';
import { selectPreferredWeightUnit } from '@/store/settings';
import { selectExercises, selectLatestExercises } from '@/store/stored-sessions';
import { formatTimeSpan } from '@/utils/format-time-span';
import { localeFormatBigNumber } from '@/utils/locale-bignumber';
import { LocalDate } from '@js-joda/core';
import { useTranslate } from '@tolgee/react';
import BigNumber from 'bignumber.js';
import { type Href, useNavigation, useRouter } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { useEffect, useRef, useState } from 'react';
import { Alert, Keyboard, Platform, Pressable, TextInput, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDispatch } from 'react-redux';

/** Which number the pad is typing: a warm-up's load, a set's reps, or the top of a rep range. */
type PadField = 'weight' | 'reps' | 'repsMax';

interface PadEditing {
  exerciseKey: string;
  position: RoutineSetPosition;
  field: PadField;
}

/** How far clear of the viewport's edge the row being typed into is kept. */
const EDITED_ROW_MARGIN = spacing[4];

type TranslateFn = ReturnType<typeof useTranslate>['t'];

interface RoutineEditorProps {
  programId: string;
  sessionIndex: number;
  /** A routine that doesn't exist yet: Save adds it to the program. */
  isNew: boolean;
}

/**
 * The routine editor: name and notes, then collapsible exercise cards with their sets, rest, progression and
 * order. Edits stay in a draft until Save; leaving with unsaved changes asks first.
 */
export function RoutineEditor({ programId, sessionIndex, isNew }: RoutineEditorProps) {
  const { t } = useTranslate();
  const { tokens } = useAppTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const goToRoutines = useGoToRoutines();
  const navigation = useNavigation();
  const dispatch = useDispatch();
  const toast = useToast();
  const { sessionService } = useServices();
  const program = useAppSelector((state) => state.program.savedPrograms[programId]);
  const latestExercises = useAppSelector(selectLatestExercises);
  const catalog = useAppSelector(selectExercises);
  const preferredUnit = useAppSelector(selectPreferredWeightUnit);
  const restTimersEnabled = useAppSelector((x) => x.settings.restTimersEnabled);
  const barWeight = useAppSelector((x) => x.settings.barWeight);
  const availablePlates = useAppSelector((x) => x.settings.availablePlates);

  const location: RoutineDraftLocation = { programId, sessionIndex };
  const saved = isNew ? undefined : program?.sessions[sessionIndex];
  const draft = useOwnedRoutineDraft(location, () => openRoutineDraft(saved));
  const { routine, keys } = draft;

  const [expandedKey, setExpandedKey] = useState<string | undefined>(undefined);
  const [editing, setEditing] = useState<PadEditing | undefined>(undefined);
  const [buffer, setBuffer] = useState<NumberPadBuffer>(() => openNumberPad({ allowDecimal: false, step: 1 }));
  const [leaving, setLeaving] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const scrollY = useRef(0);
  const editingRowRef = useRef<View>(null);

  // Typing on the pad reaches the draft when the field is left, so a number still on the pad counts too.
  const changed = isRoutineDraftChanged(draft) || (!!editing && buffer.typed !== null);
  const missing = !program || (!isNew && !saved);
  useBackWhenGone(missing);

  usePreventRemove(changed && !leaving, ({ data }) => {
    Alert.alert(t('routine_editor.discard.title'), t('routine_editor.discard.body'), [
      { text: t('routine_editor.discard.keep.button'), style: 'cancel' },
      {
        text: t('routine_editor.discard.button'),
        style: 'destructive',
        onPress: () => navigation.dispatch(data.action),
      },
    ]);
  });

  // Save leaves through here, once the prompt above has stood down for it.
  useEffect(() => {
    if (leaving) {
      router.back();
    }
  }, [leaving, router]);

  const nextSession = sessionService.hydrateSessionFromBlueprint(routine, latestExercises);
  const current = () => routineDraftAt(location) ?? draft;

  const equipmentOf = (exercise: ExerciseBlueprint) =>
    equipmentClassOf(catalog[exercise.exerciseId]?.equipment ?? null);
  const unitLabel = t(
    preferredUnit === 'pounds' ? 'routine_editor.unit.pounds.label' : 'routine_editor.unit.kilograms.label',
  );
  const formatStep = (step: BigNumber) => `${localeFormatBigNumber(step)} ${unitLabel}`;

  const updateExerciseAt = (index: number, update: (exercise: WeightedExerciseBlueprint) => ExerciseBlueprint) =>
    updateRoutineDraft(location, (r) => {
      const exercise = r.exercises[index];
      return exercise instanceof WeightedExerciseBlueprint ? r.withExercise(index, update(exercise)) : r;
    });

  // Number pad -------------------------------------------------------------------------------------------

  const rowAt = (exercise: WeightedExerciseBlueprint, position: RoutineSetPosition): RoutineSetRow | undefined =>
    routineSetRowsOf(exercise).find(
      (row) => row.position.list === position.list && row.position.index === position.index,
    );

  const typed = (
    exercise: WeightedExerciseBlueprint,
    edit: PadEditing,
    value: BigNumber,
  ): WeightedExerciseBlueprint => {
    const row = rowAt(exercise, edit.position);
    if (!row) {
      return exercise;
    }
    const number = value.integerValue(BigNumber.ROUND_HALF_UP).toNumber();
    switch (edit.field) {
      case 'reps': {
        const band = edit.position.list === 'working' && row.reps.min < row.reps.max;
        const reps = band ? { min: number, max: Math.max(number, row.reps.max) } : { min: number, max: number };
        return withLadderKeptClimbable(withRoutineSetReps(exercise, edit.position, reps));
      }
      case 'repsMax':
        return withLadderKeptClimbable(
          withRoutineSetReps(exercise, edit.position, { min: Math.min(row.reps.min, number), max: number }),
        );
      case 'weight': {
        const load = row.warmupLoad;
        if (load?.type === 'percent') {
          return withWarmupLoad(exercise, edit.position.index, { type: 'percent', percent: number });
        }
        const unit = loadUnitOf(load?.type === 'absolute' ? load.weight.unit : preferredUnit, preferredUnit);
        return withWarmupLoad(
          exercise,
          edit.position.index,
          value.isZero() ? undefined : { type: 'absolute', weight: new Weight(value, unit) },
        );
      }
    }
  };

  /** Writes what the pad holds into the draft. Nothing is written while the field still shows its old value. */
  const commitTyping = () => {
    const value = buffer.typed === null ? undefined : numberPadValue(buffer);
    if (!editing || !value) {
      return;
    }
    const index = current().keys.indexOf(editing.exerciseKey);
    updateExerciseAt(index, (exercise) => typed(exercise, editing, value));
  };

  const padFieldFor = (exercise: WeightedExerciseBlueprint, row: RoutineSetRow, field: PadField): NumberPadField => {
    if (field !== 'weight') {
      return { placeholder: field === 'repsMax' ? row.reps.max : row.reps.min, allowDecimal: false, step: 1 };
    }
    const load = row.warmupLoad;
    if (load?.type === 'percent') {
      return { placeholder: load.percent, allowDecimal: false, step: 5 };
    }
    const unit = load?.type === 'absolute' ? load.weight.unit : preferredUnit;
    return {
      placeholder: load?.type === 'absolute' ? load.weight.value : undefined,
      allowDecimal: true,
      step: weightStepFor(equipmentOf(exercise), loadUnitOf(unit, preferredUnit), exercise.weightIncrement),
    };
  };

  const openField = (exerciseKey: string, position: RoutineSetPosition, field: PadField, commit = true) => {
    if (commit) {
      commitTyping();
    }
    Keyboard.dismiss();
    const { routine: now, keys: nowKeys } = current();
    const exercise = now.exercises[nowKeys.indexOf(exerciseKey)];
    const row = exercise instanceof WeightedExerciseBlueprint ? rowAt(exercise, position) : undefined;
    if (!(exercise instanceof WeightedExerciseBlueprint) || !row) {
      setEditing(undefined);
      return;
    }
    setEditing({ exerciseKey, position, field });
    setBuffer(openNumberPad(padFieldFor(exercise, row, field)));
  };

  const closePad = () => {
    commitTyping();
    setEditing(undefined);
  };

  /** The fields the pad's Next key walks through, in table order. */
  const fieldsOf = (exercise: WeightedExerciseBlueprint) =>
    routineSetRowsOf(exercise).flatMap((row) => [
      ...(row.position.list === 'warmup' && exercise.resistance !== 'none'
        ? [{ position: row.position, field: 'weight' as const }]
        : []),
      { position: row.position, field: 'reps' as const },
      ...(row.position.list === 'working' && row.reps.min < row.reps.max
        ? [{ position: row.position, field: 'repsMax' as const }]
        : []),
    ]);

  const nextField = () => {
    if (!editing) {
      return;
    }
    commitTyping();
    const { routine: now, keys: nowKeys } = current();
    const exercise = now.exercises[nowKeys.indexOf(editing.exerciseKey)];
    if (!(exercise instanceof WeightedExerciseBlueprint)) {
      setEditing(undefined);
      return;
    }
    const fields = fieldsOf(exercise);
    const at = (field: PadField) =>
      fields.findIndex(
        (f) =>
          f.position.list === editing.position.list && f.position.index === editing.position.index && f.field === field,
      );
    // Typing the top of a range down to its bottom closes the range, and its second field with it.
    const from = at(editing.field) >= 0 ? at(editing.field) : at('reps');
    const following = from >= 0 ? fields[from + 1] : undefined;
    if (following) {
      openField(editing.exerciseKey, following.position, following.field, false);
    } else {
      setEditing(undefined);
    }
  };

  const keepEditedRowInView = () => {
    const scroll = scrollRef.current;
    const viewport = scroll?.getNativeScrollRef();
    const row = editingRowRef.current;
    if (!scroll || !viewport || !row) {
      return;
    }
    viewport.measureInWindow((_viewX, viewTop, _viewWidth, viewHeight) =>
      row.measureInWindow((_rowX, rowTop, _rowWidth, rowHeight) => {
        const below = rowTop + rowHeight + EDITED_ROW_MARGIN - (viewTop + viewHeight);
        const above = viewTop + EDITED_ROW_MARGIN - rowTop;
        if (below > 0) {
          scroll.scrollTo({ y: scrollY.current + below, animated: true });
        } else if (above > 0) {
          scroll.scrollTo({ y: Math.max(0, scrollY.current - above), animated: true });
        }
      }),
    );
  };

  useEffect(() => {
    if (editing) {
      keepEditedRowInView();
    }
  });

  const editedExercise = editing ? routine.exercises[keys.indexOf(editing.exerciseKey)] : undefined;
  const editedRow =
    editing && editedExercise instanceof WeightedExerciseBlueprint
      ? rowAt(editedExercise, editing.position)
      : undefined;
  const padWeightUnit: LoadUnit | undefined =
    editing?.field === 'weight' && editedRow?.warmupLoad?.type !== 'percent'
      ? loadUnitOf(
          editedRow?.warmupLoad?.type === 'absolute' ? editedRow.warmupLoad.weight.unit : preferredUnit,
          preferredUnit,
        )
      : undefined;
  const padAccessory =
    padWeightUnit && editedExercise instanceof WeightedExerciseBlueprint && editedExercise.resistance === 'external'
      ? weightAccessoryFor(equipmentOf(editedExercise), padWeightUnit, {
          bar: barWeight[padWeightUnit],
          plates: availablePlates[padWeightUnit],
        })
      : undefined;

  // Structure ---------------------------------------------------------------------------------------------

  const addPicked = ({ exercises: picked, asSuperset }: ExercisePick) => {
    if (!picked.length) {
      return;
    }
    const { routine: now, keys: nowKeys } = current();
    const added = picked.map(() => newExerciseKey());
    setRoutineDraftExercises(
      location,
      withPickAppended(
        now.exercises,
        picked.map((exercise) => ({ id: exercise.id, name: exercise.descriptor.name })),
        asSuperset,
      ),
      [...nowKeys, ...added],
    );
    setExpandedKey(added[0]);
  };
  const openPicker = useExercisePicker(addPicked);
  const addExercise = () => {
    closePad();
    openPicker({
      mode: 'add',
      context: { name: routine.name, exerciseIds: routine.exercises.map((exercise) => exercise.exerciseId) },
    });
  };

  const move = (index: number, direction: MoveDirection) => {
    closePad();
    const { routine: now, keys: nowKeys } = current();
    const order = orderAfterMove(now.exercises, index, direction);
    setRoutineDraftExercises(
      location,
      withExerciseMoved(now.exercises, index, direction),
      order.map((old) => nowKeys[old]!),
    );
  };

  const toggleSuperset = (index: number) => {
    updateRoutineDraft(location, (r) => r.with({ exercises: withSupersetToggled(r.exercises, index) }));
  };

  const remove = (index: number) => {
    closePad();
    const before = current();
    const name = before.routine.exercises[index]?.name ?? '';
    setRoutineDraftExercises(
      location,
      withExerciseRemoved(before.routine.exercises, index),
      before.keys.filter((_, i) => i !== index),
    );
    toast.show({
      message: t('routine_editor.removed.message', { name }),
      action: {
        label: t('generic.undo.button'),
        onPress: () => setRoutineDraftExercises(location, before.routine.exercises, before.keys),
      },
    });
  };

  const openDetails = (index: number) => {
    closePad();
    router.push({
      pathname: '/routines/manage-workouts/[programId]/manage-session/[sessionIndex]/exercise',
      params: { programId, sessionIndex, exerciseIndex: index },
    });
  };

  const openSetType = (index: number, position: RoutineSetPosition) => {
    closePad();
    router.push({
      pathname: '/routine-set-type',
      params: { programId, sessionIndex, exerciseIndex: index, list: position.list, index: position.index },
    } as unknown as Href);
  };

  // Save and leave ----------------------------------------------------------------------------------------

  const canSave = routine.name.trim() !== '' && (isNew ? routine.exercises.length > 0 : changed);

  const save = () => {
    commitTyping();
    const finished = current().routine;
    const toSave = finished.with({ name: finished.name.trim() });
    dispatch(
      updateProgram({
        programId,
        update: (p) =>
          (isNew ? p.withAddedSession(toSave) : p.withSession(sessionIndex, () => toSave)).with({
            lastEdited: LocalDate.now(),
          }),
      }),
    );
    markRoutineDraftSaved(location, toSave);
    setEditing(undefined);
    setLeaving(true);
  };

  if (missing) {
    return null;
  }

  const blocks = routineBlocksOf(routine.exercises);
  const exerciseCount = routine.exercises.length;
  const summary = [
    t('routine_editor.summary.day.label', { day: sessionIndex + 1, program: program.name }),
    t(
      exerciseCount === 1
        ? 'routine_editor.summary.exercises_one.label'
        : 'routine_editor.summary.exercises_many.label',
      {
        count: exerciseCount,
      },
    ),
    t(totalSetsOf(routine) === 1 ? 'routine_editor.summary.sets_one.label' : 'routine_editor.summary.sets_many.label', {
      count: totalSetsOf(routine),
    }),
    ...(exerciseCount ? [t('routine_editor.summary.minutes.label', { minutes: estimatedMinutesOf(routine) })] : []),
  ].join(' · ');

  const renderCard = (exercise: ExerciseBlueprint, index: number) => {
    const key = keys[index] ?? `index-${index}`;
    const expanded = expandedKey === key;
    const inSuperset = !!supersetLetterOf(routine.exercises, index);
    const next = nextSession.recordedExercises[index];
    const weighted = exercise instanceof WeightedExerciseBlueprint ? exercise : undefined;
    const actions = [
      {
        key: 'up',
        icon: 'arrowUpward' as const,
        label: t('routine_editor.actions.move_up.button'),
        onPress: canMoveExercise(routine.exercises, index, 'up') ? () => move(index, 'up') : undefined,
      },
      {
        key: 'down',
        icon: 'arrowDownward' as const,
        label: t('routine_editor.actions.move_down.button'),
        onPress: canMoveExercise(routine.exercises, index, 'down') ? () => move(index, 'down') : undefined,
      },
      {
        key: 'superset',
        icon: 'link' as const,
        label: inSuperset ? t('routine_editor.actions.unlink.button') : t('routine_editor.actions.superset.button'),
        onPress: canToggleSuperset(routine.exercises, index) ? () => toggleSuperset(index) : undefined,
      },
      {
        key: 'remove',
        icon: 'delete' as const,
        label: t('routine_editor.actions.remove.button'),
        onPress: () => remove(index),
        destructive: true,
      },
    ];

    return (
      <RoutineExerciseCard
        key={key}
        testID={`routine-exercise-${index}`}
        name={exercise.name}
        label={routineExerciseLabel(routine.exercises, index)}
        inSuperset={inSuperset}
        summary={
          weighted
            ? weightedSummary(
                t,
                weighted,
                next instanceof RecordedWeightedExercise ? next : undefined,
                restTimersEnabled,
              )
            : cardioSummary(t, exercise as CardioExerciseBlueprint)
        }
        progressionTag={weighted ? progressionTagOf(t, weighted, formatStep, unitLabel) : undefined}
        expanded={expanded}
        onToggle={() => {
          closePad();
          setExpandedKey(expanded ? undefined : key);
        }}
      >
        {weighted ? (
          <>
            <RoutineSetTable
              headers={{
                set: t('routine_editor.set_table.set.label'),
                weight: unitLabel,
                reps: t('routine_editor.set_table.reps.label'),
              }}
              rows={setTableRows(weighted, index, key, next instanceof RecordedWeightedExercise ? next : undefined)}
              addSetLabel={t('routine_editor.set_table.add_set.button')}
              onAddSet={() => {
                closePad();
                updateExerciseAt(index, withRoutineSetAdded);
              }}
              note={weightNote(t, weighted, next instanceof RecordedWeightedExercise ? next : undefined)}
              editingRowRef={editingRowRef}
            />
            {restTimersEnabled ? (
              <RoutineRestEditor
                rest={weighted.restBetweenSets}
                onChange={(restBetweenSets) => updateExerciseAt(index, (e) => e.with({ restBetweenSets }))}
              />
            ) : null}
            <RoutineProgressionEditor
              exercise={weighted}
              fallbackStep={weightStepFor(equipmentOf(weighted), preferredUnit, weighted.weightIncrement)}
              formatStep={formatStep}
              onChange={(progression) => updateExerciseAt(index, (e) => e.with({ progression }))}
            />
          </>
        ) : null}
        <MoreOptionsRow onPress={() => openDetails(index)} />
        <RoutineExerciseActions actions={actions} name={exercise.name} />
      </RoutineExerciseCard>
    );
  };

  const setTableRows = (
    exercise: WeightedExerciseBlueprint,
    index: number,
    key: string,
    next: RecordedWeightedExercise | undefined,
  ): RoutineSetTableRow[] => {
    const rows = routineSetRowsOf(exercise);
    const labels = setLabels(rows.map((row) => row.kind));
    return rows.map((row, i) => {
      const badge: SetBadgeProps =
        row.kind === 'working' ? { kind: 'working', number: Number(labels[i]) } : { kind: row.kind };
      const setName = setBadgeText(badge, t).accessibilityLabel;
      const isEditing = (field: PadField) =>
        editing?.exerciseKey === key &&
        editing.position.list === row.position.list &&
        editing.position.index === row.position.index &&
        editing.field === field;
      const live = numberPadValue(buffer);
      const liveText = live === undefined ? '' : localeFormatBigNumber(live);

      const weightCell = (): RoutineSetTableRow['weight'] => {
        if (row.position.list === 'working' || exercise.resistance === 'none') {
          const carried = next?.potentialSets[row.position.index]?.weight;
          const text = carried && !carried.value.isZero() ? localeFormatBigNumber(carried.value) : '-';
          return {
            text,
            muted: true,
            accessibilityLabel:
              text === '-'
                ? t('routine_editor.set_table.weight_none.label', { set: setName })
                : t('routine_editor.set_table.weight_carried.label', { set: setName, weight: text }),
          };
        }
        const load = row.warmupLoad;
        const editingWeight = isEditing('weight');
        const text = editingWeight
          ? load?.type === 'percent'
            ? `${liveText}%`
            : liveText || '-'
          : load?.type === 'percent'
            ? `${load.percent}%`
            : load?.type === 'absolute'
              ? localeFormatBigNumber(load.weight.value)
              : '-';
        return {
          text,
          editing: editingWeight,
          accessibilityLabel: t('routine_editor.set_table.weight.label', { set: setName, weight: text }),
          onPress: () => openField(key, row.position, 'weight'),
        };
      };

      const repsText = isEditing('reps')
        ? row.position.list === 'working' && row.reps.min < row.reps.max
          ? `${liveText}-${row.reps.max}`
          : liveText
        : isEditing('repsMax')
          ? `${row.reps.min}-${liveText}`
          : formatRepsTarget(row.reps);

      return {
        key: `${row.position.list}-${row.position.index}`,
        badge,
        badgeAccessibilityLabel: t('routine_editor.set_table.set_type.button', { set: setName }),
        onPickType: () => openSetType(index, row.position),
        weight: weightCell(),
        reps: {
          testID: `routine-set-reps-${row.position.list}-${row.position.index}`,
          text: repsText,
          editing: isEditing('reps') || isEditing('repsMax'),
          accessibilityLabel: t('routine_editor.set_table.reps_value.label', { set: setName, reps: repsText }),
          onPress: () => openField(key, row.position, 'reps'),
        },
        removeAccessibilityLabel: t('routine_editor.set_table.remove.button', { set: setName }),
        onRemove: canRemoveRoutineSet(exercise, row.position)
          ? () => {
              closePad();
              updateExerciseAt(index, (e) => withRoutineSetRemoved(e, row.position));
            }
          : undefined,
      };
    });
  };

  return (
    <View style={{ flex: 1, backgroundColor: tokens.bg }}>
      <View
        style={{
          paddingTop: insets.top,
          backgroundColor: tokens.bg,
          borderBottomWidth: 1,
          borderBottomColor: tokens.line,
        }}
      >
        <View
          style={{
            minHeight: 56,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: spacing[3],
          }}
        >
          <Pressable
            testID="routine-cancel"
            onPress={() => router.back()}
            accessibilityRole="button"
            style={{
              minHeight: MIN_TOUCH_TARGET,
              minWidth: MIN_TOUCH_TARGET,
              justifyContent: 'center',
              paddingHorizontal: spacing[2],
            }}
          >
            <SurfaceText font="text-base" weight="500" style={{ color: tokens.muted }}>
              {t('generic.cancel.button')}
            </SurfaceText>
          </Pressable>
          <SurfaceText font="text-base" weight="700" accessibilityRole="header" style={{ color: tokens.ink }}>
            {isNew ? t('routine_editor.new.title') : t('routine_editor.edit.title')}
          </SurfaceText>
          <Pressable
            testID="routine-save"
            onPress={save}
            disabled={!canSave}
            accessibilityRole="button"
            accessibilityState={{ disabled: !canSave }}
            accessibilityHint={canSave ? undefined : t('routine_editor.save.disabled.hint')}
            style={{ minHeight: MIN_TOUCH_TARGET, justifyContent: 'center' }}
          >
            {({ pressed }) => (
              <View
                // Pressing Save also leaves the screen; see ActionButton for why the label must not move.
                collapsable={false}
                style={{
                  minHeight: 40,
                  borderRadius: 20,
                  paddingHorizontal: spacing[4],
                  justifyContent: 'center',
                  backgroundColor: canSave ? tokens.accent : tokens.track,
                  opacity: canSave && pressed ? 0.85 : 1,
                }}
              >
                <SurfaceText font="text-base" weight="600" style={{ color: canSave ? tokens.onAccent : tokens.muted }}>
                  {t('generic.save.button')}
                </SurfaceText>
              </View>
            )}
          </Pressable>
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        keyboardShouldPersistTaps="handled"
        onScroll={(event) => {
          scrollY.current = event.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={32}
        contentContainerStyle={{
          padding: spacing.pageHorizontalMargin,
          paddingBottom: spacing[10],
          gap: spacing[3],
        }}
      >
        <Card style={{ gap: spacing[2] }}>
          <SurfaceText
            font="text-xs"
            weight="600"
            style={{ color: tokens.muted, textTransform: 'uppercase', letterSpacing: 0.7 }}
          >
            {t('routine_editor.name.label')}
          </SurfaceText>
          <TextInput
            testID="routine-name"
            value={routine.name}
            onChangeText={(name) => updateRoutineDraft(location, (r) => r.withName(name))}
            onFocus={closePad}
            placeholder={t('routine_editor.name.placeholder')}
            placeholderTextColor={tokens.placeholder}
            accessibilityLabel={t('routine_editor.name.label')}
            autoFocus={isNew}
            style={{
              fontFamily: fontFamily.text,
              fontSize: 26,
              fontWeight: '700',
              letterSpacing: -0.5,
              color: tokens.ink,
              padding: 0,
              minHeight: MIN_TOUCH_TARGET,
            }}
          />
          <RoutineColorSwatches
            value={routineColorOf(routine.color, sessionIndex)}
            onChange={(color) => {
              closePad();
              updateRoutineDraft(location, (r) => r.with({ color }));
            }}
            label={t('routine_editor.color.label')}
            colorLabel={(color) => colorLabelOf(t, color)}
          />
          <TextInput
            testID="routine-notes"
            value={routine.notes}
            onChangeText={(notes) => updateRoutineDraft(location, (r) => r.withNotes(notes))}
            onFocus={closePad}
            placeholder={t('routine_editor.notes.placeholder')}
            placeholderTextColor={tokens.placeholder}
            accessibilityLabel={t('routine_editor.notes.label')}
            multiline
            style={{
              fontFamily: fontFamily.text,
              fontSize: 14,
              color: tokens.ink,
              padding: 0,
              minHeight: MIN_TOUCH_TARGET,
              textAlignVertical: 'center',
            }}
          />
          <SurfaceText font="text-sm" style={{ color: tokens.muted }}>
            {summary}
          </SurfaceText>
        </Card>

        {exerciseCount === 0 ? (
          <RoutineStartOptions
            onPickExercises={addExercise}
            onDescribe={() => router.push('/routines/ai/planner')}
            onImport={() => router.push('/routines/import-plan-info')}
            onFromProgram={() => goToRoutines()}
          />
        ) : (
          <>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                paddingHorizontal: spacing[1],
                paddingTop: spacing[1],
              }}
            >
              <SurfaceText font="text-lg" weight="700" accessibilityRole="header" style={{ color: tokens.ink }}>
                {t('routine_editor.exercises.title')}
              </SurfaceText>
              <SurfaceText font="text-sm" style={{ color: tokens.muted }}>
                {t('routine_editor.exercises.hint')}
              </SurfaceText>
            </View>
            {blocks.map((block) => (
              <View key={keys[block.indices[0]!] ?? block.indices[0]} style={{ gap: spacing[2] }}>
                {block.supersetLetter ? (
                  <RoutineSupersetHeader
                    title={t('routine_editor.superset.title', { letter: block.supersetLetter })}
                    unlinkLabel={t('routine_editor.superset.unlink.button')}
                    onUnlink={() => toggleSuperset(block.indices[0]!)}
                  />
                ) : null}
                {block.indices.map((index) => renderCard(routine.exercises[index]!, index))}
              </View>
            ))}
            <Pressable
              testID="routine-add-exercise"
              onPress={addExercise}
              accessibilityRole="button"
              style={({ pressed }) => ({
                minHeight: 54,
                borderRadius: 16,
                borderWidth: 1.5,
                borderStyle: 'dashed',
                borderColor: tokens.line3,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: spacing[2],
                backgroundColor: pressed ? tokens.track : undefined,
              })}
            >
              <MsIconSrc name="add" size={20} color={tokens.ink} />
              <SurfaceText font="text-base" weight="600" style={{ color: tokens.ink }}>
                {t('routine_editor.add_exercise.button')}
              </SurfaceText>
            </Pressable>
          </>
        )}
      </ScrollView>

      {ASK_AI_BAR_ENABLED && exerciseCount > 0 && !editing ? (
        <View
          style={{
            paddingHorizontal: spacing.pageHorizontalMargin,
            paddingTop: spacing[2],
            paddingBottom: spacing[2] + (Platform.OS === 'ios' ? insets.bottom : 0),
            borderTopWidth: 1,
            borderTopColor: tokens.line,
            backgroundColor: tokens.bg,
          }}
        >
          <AskAiBar onPress={() => router.push('/routines/ai/planner')} />
        </View>
      ) : null}
      <View onLayout={keepEditedRowInView}>
        {/* Android lays the screen out above the tab bar, so only iOS keeps a bottom inset. */}
        <NumberPad
          visible={!!editing}
          buffer={buffer}
          onAction={(action) => setBuffer((b) => numberPadReducer(b, action))}
          unit={padWeightUnit}
          accessory={padAccessory}
          primary="next"
          onPrimary={nextField}
          onHide={closePad}
          bottomInset={Platform.select({ ios: insets.bottom, default: 0 })}
        />
      </View>
    </View>
  );
}

function MoreOptionsRow({ onPress }: { onPress: () => void }) {
  const { t } = useTranslate();
  const { tokens } = useAppTheme();
  return (
    <Pressable
      testID="routine-exercise-more"
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => ({
        minHeight: MIN_TOUCH_TARGET,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing[3],
        paddingVertical: spacing[2],
        paddingHorizontal: spacing[3],
        borderRadius: 12,
        backgroundColor: pressed ? tokens.track : tokens.bg,
      })}
    >
      <View style={{ flex: 1, gap: spacing[0.5] }}>
        <SurfaceText font="text-sm" weight="600" style={{ color: tokens.ink }}>
          {t('routine_editor.more_options.title')}
        </SurfaceText>
        <SurfaceText font="text-xs" style={{ color: tokens.muted }}>
          {t('routine_editor.more_options.body')}
        </SurfaceText>
      </View>
      <MsIconSrc name="chevronRight" size={20} color={tokens.muted} />
    </Pressable>
  );
}

function colorLabelOf(t: TranslateFn, color: RoutineColor): string {
  switch (color) {
    case 'vermilion':
      return t('routine_editor.color.vermilion.label');
    case 'green':
      return t('routine_editor.color.green.label');
    case 'blue':
      return t('routine_editor.color.blue.label');
    case 'ochre':
      return t('routine_editor.color.ochre.label');
    case 'purple':
      return t('routine_editor.color.purple.label');
    case 'stone':
      return t('routine_editor.color.stone.label');
  }
}

function loadUnitOf(unit: Weight['unit'], fallback: LoadUnit): LoadUnit {
  return unit === 'nil' ? fallback : unit;
}

/** "1 warm-up + 4 × 5 · 87.5 · rest 2:30", with the weight the next workout opens on when there is one. */
function weightedSummary(
  t: TranslateFn,
  exercise: WeightedExerciseBlueprint,
  next: RecordedWeightedExercise | undefined,
  showRest: boolean,
): string {
  const warmups = exercise.warmupSets.length;
  const sets = `${exercise.plannedSets.length} × ${formatPlannedSets(exercise.plannedSets)}`;
  const heaviest = next?.potentialSets.reduce<Weight | undefined>(
    (top, set) => (!top || set.weight.isGreaterThan(top) ? set.weight : top),
    undefined,
  );
  const parts = [
    warmups
      ? `${t(warmups === 1 ? 'routine_editor.exercise.warmups_one.label' : 'routine_editor.exercise.warmups_many.label', { count: warmups })} + ${sets}`
      : sets,
    ...(heaviest && !heaviest.value.isZero() ? [heaviest.shortLocaleFormat()] : []),
    ...(showRest
      ? [t('routine_editor.exercise.rest.label', { rest: formatTimeSpan(exercise.restBetweenSets.minRest) })]
      : []),
  ];
  return parts.join(' · ');
}

function cardioSummary(t: TranslateFn, exercise: CardioExerciseBlueprint): string {
  const first = exercise.sets[0];
  return first
    ? t('routine_editor.exercise.cardio.label', {
        count: exercise.sets.length,
        target: formatCardioTarget(first.target),
      })
    : '';
}

/** Where the working sets' weights come from, since the routine itself doesn't plan them. */
function weightNote(
  t: TranslateFn,
  exercise: WeightedExerciseBlueprint,
  next: RecordedWeightedExercise | undefined,
): string | undefined {
  if (exercise.resistance === 'none') {
    return undefined;
  }
  const carries = next?.potentialSets.some((set) => !set.weight.value.isZero());
  return carries ? t('routine_editor.set_table.carried.note') : t('routine_editor.set_table.first_time.note');
}
