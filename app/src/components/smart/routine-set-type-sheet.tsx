import { haptics } from '@/components/presentation/foundation/haptics';
import { setBadgeText, type SetBadgeProps } from '@/components/presentation/foundation/set-badge/set-badge-kinds';
import { SheetHeader } from '@/components/presentation/foundation/sheet-header';
import { SetTypeOption } from '@/components/presentation/live-workout/set-type-option';
import {
  canChangeRoutineSetKind,
  type RoutineSetPosition,
  routineSetRowsOf,
  withRoutineSetKind,
} from '@/components/presentation/workout-editor/routine-sets';
import { updateRoutineDraft, useRoutineDraft } from '@/components/smart/routine-draft';
import { spacing, useAppTheme } from '@/hooks/useAppTheme';
import { WeightedExerciseBlueprint } from '@/models/blueprint-models';
import { setLabels, type SetKind } from '@/models/session-models/set-kind';
import type { TranslationKey } from '@tolgee/web';
import { useTranslate } from '@tolgee/react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const SET_TYPES: readonly SetKind[] = ['working', 'warmup', 'drop', 'myo', 'failure'];

const SET_TYPE_COPY = {
  working: { name: 'live_workout.set_type.working.label', body: 'live_workout.set_type.working.body' },
  warmup: { name: 'live_workout.set_type.warmup.label', body: 'live_workout.set_type.warmup.body' },
  drop: { name: 'live_workout.set_type.drop.label', body: 'live_workout.set_type.drop.body' },
  myo: { name: 'live_workout.set_type.myo.label', body: 'live_workout.set_type.myo.body' },
  failure: { name: 'live_workout.set_type.failure.label', body: 'live_workout.set_type.failure.body' },
} as const satisfies Record<SetKind, { name: TranslationKey; body: TranslationKey }>;

type SetTypeParams = {
  programId?: string;
  sessionIndex?: string;
  exerciseIndex?: string;
  list?: string;
  index?: string;
};

/** The set-type sheet over the routine editor. It edits the editor's draft, which Save then writes. */
export function RoutineSetTypeSheet() {
  const params = useLocalSearchParams<SetTypeParams>();
  const { back } = useRouter();
  const { tokens } = useAppTheme();
  const { t } = useTranslate();
  const insets = useSafeAreaInsets();
  const location = { programId: params.programId ?? '', sessionIndex: Number(params.sessionIndex) };
  const draft = useRoutineDraft(location);
  const exerciseIndex = Number(params.exerciseIndex);
  const position = positionFrom(params);
  // A pick can move the set to the other list, so the sheet keeps showing the pick while it closes.
  const [picked, setPicked] = useState<SetKind>();
  const [shown] = useState(() => draft?.routine.exercises[exerciseIndex]);
  const exercise = picked ? shown : draft?.routine.exercises[exerciseIndex];
  const row =
    exercise instanceof WeightedExerciseBlueprint && position
      ? routineSetRowsOf(exercise).find((r) => r.position.list === position.list && r.position.index === position.index)
      : undefined;
  const found = !!row;

  useEffect(() => {
    if (!found) {
      back();
    }
  }, [found, back]);

  if (!row || !position || !(exercise instanceof WeightedExerciseBlueprint)) {
    return null;
  }

  const rows = routineSetRowsOf(exercise);
  const labels = setLabels(rows.map((r) => r.kind));
  const rowIndex = rows.indexOf(row);
  const badgeOf = (kind: SetKind): SetBadgeProps => {
    if (kind !== 'working') {
      return { kind };
    }
    // The number the set would have as a working set: one more than the working sets before it.
    const before = rows.slice(0, rowIndex).filter((r) => r.kind === 'working').length;
    return { kind, number: before + 1 };
  };
  const current: SetBadgeProps =
    row.kind === 'working' ? { kind: 'working', number: Number(labels[rowIndex]) } : { kind: row.kind };

  const pick = (kind: SetKind) => {
    if (picked) {
      return;
    }
    haptics.selection();
    setPicked(kind);
    updateRoutineDraft(location, (routine) => {
      const target = routine.exercises[exerciseIndex];
      return target instanceof WeightedExerciseBlueprint
        ? routine.withExercise(exerciseIndex, withRoutineSetKind(target, position, kind))
        : routine;
    });
    back();
  };

  return (
    <View style={{ flex: 1, backgroundColor: tokens.card, paddingHorizontal: spacing.pageHorizontalMargin }}>
      <SheetHeader
        title={t('live_workout.set_type.title')}
        subtitle={t('live_workout.set_type.subtitle', {
          name: exercise.name,
          set: setBadgeText(current, t).accessibilityLabel,
        })}
        onClose={back}
      />
      <ScrollView
        accessibilityRole="radiogroup"
        contentContainerStyle={{ gap: spacing[2], paddingBottom: insets.bottom + spacing[4] }}
      >
        {SET_TYPES.map((kind) => {
          const allowed = canChangeRoutineSetKind(exercise, position, kind);
          return (
            <SetTypeOption
              key={kind}
              testID={`set-type-${kind}`}
              badge={badgeOf(kind)}
              name={t(SET_TYPE_COPY[kind].name)}
              description={t(allowed ? SET_TYPE_COPY[kind].body : 'live_workout.set_type.warmup_unavailable.body')}
              selected={(picked ?? row.kind) === kind}
              disabled={!allowed}
              onPress={() => pick(kind)}
            />
          );
        })}
      </ScrollView>
    </View>
  );
}

function positionFrom(params: SetTypeParams): RoutineSetPosition | undefined {
  const index = Number(params.index);
  if ((params.list !== 'warmup' && params.list !== 'working') || !Number.isInteger(index) || index < 0) {
    return undefined;
  }
  return { list: params.list, index };
}
