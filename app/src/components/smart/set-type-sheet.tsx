import { haptics } from '@/components/presentation/foundation/haptics';
import type { SetBadgeProps } from '@/components/presentation/foundation/set-badge';
import { SheetHeader } from '@/components/presentation/foundation/sheet-header';
import { SetTypeOption } from '@/components/presentation/live-workout/set-type-option';
import { spacing, useAppTheme } from '@/hooks/useAppTheme';
import { useSetEntryStore } from '@/hooks/useLiveSetEntry';
import { RecordedWeightedExercise, Session } from '@/models/session-models';
import { SetPosition } from '@/models/session-models/recorded-weighted-exercise';
import { canChangeSetKind, setRowsOf, withSetKind, workingNumberFor } from '@/models/session-models/set-entry';
import type { SetKind } from '@/models/session-models/set-kind';
import { useAppSelector } from '@/store';
import { selectActiveSession, updateStoredSession } from '@/store/stored-sessions';
import type { TranslationKey } from '@tolgee/web';
import { useTranslate } from '@tolgee/react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDispatch } from 'react-redux';

const SET_TYPES: readonly SetKind[] = ['working', 'warmup', 'drop', 'myo', 'failure'];

const SET_TYPE_COPY = {
  working: { name: 'live_workout.set_type.working.label', body: 'live_workout.set_type.working.body' },
  warmup: { name: 'live_workout.set_type.warmup.label', body: 'live_workout.set_type.warmup.body' },
  drop: { name: 'live_workout.set_type.drop.label', body: 'live_workout.set_type.drop.body' },
  myo: { name: 'live_workout.set_type.myo.label', body: 'live_workout.set_type.myo.body' },
  failure: { name: 'live_workout.set_type.failure.label', body: 'live_workout.set_type.failure.body' },
} as const satisfies Record<SetKind, { name: TranslationKey; body: TranslationKey }>;

type SetTypeParams = { exerciseIndex?: string; list?: string; index?: string };

/** The set-type sheet over the live workout: Working, Warm-up, Drop, Myo-reps or To failure for one set. */
export function SetTypeSheet() {
  const session = useAppSelector(selectActiveSession);
  const params = useLocalSearchParams<SetTypeParams>();
  const { back } = useRouter();
  const exerciseIndex = Number(params.exerciseIndex);
  const position = positionFrom(params);
  const exercise = session?.recordedExercises[exerciseIndex];
  const found = !!position && exercise instanceof RecordedWeightedExercise && !!exercise.slotAt(position);

  useEffect(() => {
    if (!found) {
      back();
    }
  }, [found, back]);

  return found && session && position ? (
    <SheetContent session={session} exerciseIndex={exerciseIndex} position={position} />
  ) : null;
}

function SheetContent(props: { session: Session; exerciseIndex: number; position: SetPosition }) {
  const { session, exerciseIndex, position } = props;
  const { tokens } = useAppTheme();
  const { t } = useTranslate();
  const { back } = useRouter();
  const dispatch = useDispatch();
  const insets = useSafeAreaInsets();
  const { stateFor, apply } = useSetEntryStore(session, (update) =>
    dispatch(updateStoredSession({ sessionId: session.id, update })),
  );
  const state = stateFor(exerciseIndex);
  const slot = state?.exercise.slotAt(position);
  if (!state || !slot) {
    return null;
  }

  const rowNumber = setRowsOf(state).findIndex((row) => samePosition(row.position, position)) + 1;
  const pick = (kind: SetKind) => {
    apply(exerciseIndex, (current) => withSetKind(current, position, kind));
    back();
  };

  return (
    <View style={{ flex: 1, backgroundColor: tokens.card, paddingHorizontal: spacing.pageHorizontalMargin }}>
      <SheetHeader
        title={t('live_workout.set_type.title')}
        subtitle={t('live_workout.set_type.subtitle', { name: state.exercise.blueprint.name, number: rowNumber })}
        onClose={back}
      />
      <ScrollView
        accessibilityRole="radiogroup"
        contentContainerStyle={{ gap: spacing[2], paddingBottom: insets.bottom + spacing[4] }}
      >
        {SET_TYPES.map((kind) => {
          const allowed = canChangeSetKind(state.exercise, position, kind);
          const badge: SetBadgeProps =
            kind === 'working' ? { kind, number: workingNumberFor(state, position) } : { kind };
          return (
            <SetTypeOption
              key={kind}
              testID={`set-type-${kind}`}
              badge={badge}
              name={t(SET_TYPE_COPY[kind].name)}
              description={t(allowed ? SET_TYPE_COPY[kind].body : 'live_workout.set_type.warmup_unavailable.body')}
              selected={slot.kind === kind}
              disabled={!allowed}
              onPress={() => {
                haptics.selection();
                pick(kind);
              }}
            />
          );
        })}
      </ScrollView>
    </View>
  );
}

function positionFrom(params: SetTypeParams): SetPosition | undefined {
  const index = Number(params.index);
  if ((params.list !== 'warmup' && params.list !== 'working') || !Number.isInteger(index) || index < 0) {
    return undefined;
  }
  return { list: params.list, index };
}

function samePosition(a: SetPosition, b: SetPosition): boolean {
  return a.list === b.list && a.index === b.index;
}
