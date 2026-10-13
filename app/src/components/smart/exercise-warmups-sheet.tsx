import { ExerciseEditScope, sessionEditScope } from '@/components/presentation/workout-editor/exercise-edit-copy';
import { warmupsScopeNote, workingWeightOf } from '@/components/presentation/workout-editor/warmup-edit';
import { WarmupsEditor } from '@/components/presentation/workout-editor/warmups-editor';
import { updateExerciseEdit, useExerciseEdit, useOwnedExerciseEdit } from '@/components/smart/exercise-edit-draft';
import { useSessionExerciseDraft } from '@/components/smart/session-exercise-draft';
import { useBackWhenGone } from '@/hooks/useBackWhenGone';
import { useAppTheme } from '@/hooks/useAppTheme';
import { usePreferredWeightUnit } from '@/hooks/usePreferredWeightUnit';
import { ExerciseBlueprint, WeightedExerciseBlueprint } from '@/models/blueprint-models';
import { equipmentClassOf, weightStepFor } from '@/models/equipment';
import { RecordedWeightedExercise } from '@/models/session-models';
import { LoadUnit, Weight } from '@/models/weight';
import { useAppSelector, useAppSelectorWithArg } from '@/store';
import { selectActiveSessionId, selectExercises, selectSession } from '@/store/stored-sessions';
import { useTranslate } from '@tolgee/react';
import BigNumber from 'bignumber.js';
import { Href, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Params = {
  /** Over the edit exercise sheet: the edit open there. */
  editId?: string;
  scope?: string;
  weight?: string;
  unit?: string;
  /** From the live workout's Warm-up chip: the exercise of the workout. */
  sessionId?: string;
  index?: string;
};

/**
 * The warm-up sheet over the edit exercise sheet, editing the exercise open there. `workingWeight` is
 * today's heaviest working set, which percentages resolve against; there is none in a routine.
 */
export function getEditorWarmupsHref(
  editId: string,
  scope: ExerciseEditScope,
  workingWeight: Weight | undefined,
): Href {
  return {
    pathname: '/exercise-warmups',
    params: {
      editId,
      scope: JSON.stringify(scope),
      ...(workingWeight ? { weight: workingWeight.value.toString(), unit: workingWeight.unit } : {}),
    },
  } as unknown as Href;
}

/** The warm-up sheet on one exercise of a workout, from its Warm-up chip. */
export function getSessionWarmupsHref(sessionId: string, index: number): Href {
  return { pathname: '/exercise-warmups', params: { sessionId, index: String(index) } } as unknown as Href;
}

/**
 * The warm-up sheet (PM-47), from the live workout's Warm-up chip or the edit exercise sheet's Warm-ups
 * row. From the chip it holds the edit until it closes and then applies it to the workout, as the editor
 * does, so a changed ramp is offered to the routine at finish like any other edit.
 */
export function ExerciseWarmupsSheet() {
  const params = useLocalSearchParams<Params>();
  if (params.sessionId !== undefined) {
    return <SessionWarmupsSheet sessionId={params.sessionId} index={Number(params.index)} />;
  }
  return <EditorWarmupsSheet {...params} />;
}

function EditorWarmupsSheet(params: Params) {
  const editId = params.editId ?? '';
  const exercise = useExerciseEdit(editId);
  const weighted = exercise instanceof WeightedExerciseBlueprint ? exercise : undefined;
  useBackWhenGone(!weighted);
  if (!weighted) {
    return null;
  }
  return (
    <WarmupsSheet
      exercise={weighted}
      update={(fn) => updateExerciseEdit(editId, (current) => weightedUpdate(current, fn))}
      scope={parseScope(params.scope)}
      workingWeight={parseWeight(params.weight, params.unit)}
    />
  );
}

function SessionWarmupsSheet(props: { sessionId: string; index: number }) {
  const session = useAppSelectorWithArg(selectSession, props.sessionId);
  const activeSessionId = useAppSelector(selectActiveSessionId);
  const recorded = session?.recordedExercises[props.index];
  const weighted = recorded instanceof RecordedWeightedExercise ? recorded : undefined;
  useBackWhenGone(!weighted);
  if (!session || !weighted) {
    return null;
  }
  return (
    <OwnedSessionWarmups
      sessionId={props.sessionId}
      index={props.index}
      exercise={weighted.blueprint}
      scope={sessionEditScope(session, activeSessionId)}
      workingWeight={workingWeightOf(weighted.potentialSets)}
    />
  );
}

function OwnedSessionWarmups(props: {
  sessionId: string;
  index: number;
  exercise: WeightedExerciseBlueprint;
  scope: ExerciseEditScope;
  workingWeight: Weight | undefined;
}) {
  const keepDraft = useSessionExerciseDraft(props.sessionId, props.index);
  const { exercise, update } = useOwnedExerciseEdit(props.exercise, keepDraft);
  if (!(exercise instanceof WeightedExerciseBlueprint)) {
    return null;
  }
  return (
    <WarmupsSheet
      exercise={exercise}
      update={(fn) => update((current) => weightedUpdate(current, fn))}
      scope={props.scope}
      workingWeight={props.workingWeight}
    />
  );
}

function WarmupsSheet(props: {
  exercise: WeightedExerciseBlueprint;
  update: (fn: (exercise: WeightedExerciseBlueprint) => WeightedExerciseBlueprint) => void;
  scope: ExerciseEditScope;
  workingWeight: Weight | undefined;
}) {
  const { t } = useTranslate();
  const { tokens } = useAppTheme();
  const { back } = useRouter();
  const insets = useSafeAreaInsets();
  const catalog = useAppSelector(selectExercises);
  const barWeight = useAppSelector((x) => x.settings.barWeight);
  const preferred = usePreferredWeightUnit();
  const preferredUnit: LoadUnit = preferred === 'pounds' ? 'pounds' : 'kilograms';
  // A second tap while the sheet animates away would go back past what opened it.
  const [closing, setClosing] = useState(false);
  const equipment = equipmentClassOf(catalog[props.exercise.exerciseId]?.equipment ?? null);

  return (
    <View style={{ flex: 1, backgroundColor: tokens.card }} testID="warmups-sheet">
      <WarmupsEditor
        exercise={props.exercise}
        update={props.update}
        workingWeight={props.workingWeight}
        bar={new Weight(barWeight[preferredUnit], preferredUnit)}
        preferredUnit={preferredUnit}
        stepFor={(unit) => weightStepFor(equipment, unit, props.exercise.weightIncrement)}
        scopeNote={warmupsScopeNote(t, props.scope)}
        bottomInset={insets.bottom}
        onDone={() => {
          if (closing) {
            return;
          }
          setClosing(true);
          back();
        }}
      />
    </View>
  );
}

function weightedUpdate(
  current: ExerciseBlueprint,
  fn: (exercise: WeightedExerciseBlueprint) => WeightedExerciseBlueprint,
): ExerciseBlueprint {
  return current instanceof WeightedExerciseBlueprint ? fn(current) : current;
}

function parseScope(json: string | undefined): ExerciseEditScope {
  try {
    return json ? (JSON.parse(json) as ExerciseEditScope) : { kind: 'workout', routineName: undefined };
  } catch {
    return { kind: 'workout', routineName: undefined };
  }
}

function parseWeight(value: string | undefined, unit: string | undefined): Weight | undefined {
  if (!value || (unit !== 'kilograms' && unit !== 'pounds')) {
    return undefined;
  }
  const number = new BigNumber(value);
  return number.isFinite() && number.isGreaterThan(0) ? new Weight(number, unit) : undefined;
}
