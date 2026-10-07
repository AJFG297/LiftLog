import { ActionButton } from '@/components/presentation/foundation/action-button';
import { Card } from '@/components/presentation/foundation/card';
import { haptics } from '@/components/presentation/foundation/haptics';
import { ListRow } from '@/components/presentation/foundation/list-row';
import { SheetHeader } from '@/components/presentation/foundation/sheet-header';
import { Switch } from '@/components/presentation/foundation/switch';
import { WheelPicker } from '@/components/presentation/foundation/wheel-picker';
import {
  failedSetHintOf,
  RestDraft,
  restDraftOf,
  restOfDraft,
  restSaveLabelOf,
  withFailedSetRestOn,
} from '@/components/presentation/workout-editor/rest-edit';
import { cardioRestOf, withCardioRest } from '@/components/presentation/workout-editor/cardio-targets';
import { updateExerciseEdit, useExerciseEdit } from '@/components/smart/exercise-edit-draft';
import { useBackWhenGone } from '@/hooks/useBackWhenGone';
import { spacing, useAppTheme } from '@/hooks/useAppTheme';
import { CardioExerciseBlueprint, Rest, WeightedExerciseBlueprint } from '@/models/blueprint-models';
import { REST_PICK_MINUTES, REST_PICK_SECONDS, RestPick } from '@/models/rest-default';
import { useTranslate } from '@tolgee/react';
import { Href, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** The Rest sheet over the edit exercise sheet, editing the exercise open there. */
export function getExerciseEditRestHref(editId: string): Href {
  return { pathname: '/exercise-edit-rest', params: { editId } } as unknown as Href;
}

/**
 * The exercise's rest on minute and second wheels, like the live workout's rest sheet, and a switch for a
 * different rest after a failed set that brings its own wheels (plan decision D5). Opened from the edit
 * exercise sheet's Rest row; Save applies and closes, closing without it leaves the rest as it was. For Time &
 * distance it is the rest between rounds: no failed sets, and 0:00 for none.
 */
export function ExerciseEditRestSheet() {
  const { editId } = useLocalSearchParams<{ editId?: string }>();
  const exercise = useExerciseEdit(editId ?? '');
  useBackWhenGone(!exercise);
  return exercise ? <SheetContent editId={editId ?? ''} exercise={exercise} /> : null;
}

/** A cardio exercise without a rest opens the wheels on the short rest. */
function restBefore(exercise: WeightedExerciseBlueprint | CardioExerciseBlueprint): Rest {
  return exercise instanceof WeightedExerciseBlueprint
    ? exercise.restBetweenSets
    : { rest: cardioRestOf(exercise) ?? Rest.short.rest };
}

function SheetContent({
  editId,
  exercise,
}: {
  editId: string;
  exercise: WeightedExerciseBlueprint | CardioExerciseBlueprint;
}) {
  const { t } = useTranslate();
  const { tokens } = useAppTheme();
  const { back } = useRouter();
  const insets = useSafeAreaInsets();
  const cardio = exercise instanceof CardioExerciseBlueprint;
  const before = restBefore(exercise);
  const [draft, setDraft] = useState<RestDraft>(() => restDraftOf(before));
  // A second tap while the sheet animates away would go back past the editor.
  const [saved, setSaved] = useState(false);
  const rest = restOfDraft(draft, before);

  const save = () => {
    if (saved) {
      return;
    }
    setSaved(true);
    updateExerciseEdit(editId, (current) =>
      current instanceof WeightedExerciseBlueprint
        ? current.with({ restBetweenSets: restOfDraft(draft, current.restBetweenSets) })
        : withCardioRest(current, restOfDraft(draft, restBefore(current)).rest),
    );
    haptics.selection();
    back();
  };

  const failedSetTitle = t('exercise_editor.rest_sheet.failed_set.title');
  const failedSetHint = failedSetHintOf(t, rest);
  const toggleFailedSet = (on: boolean) => setDraft((d) => withFailedSetRestOn(d, on));

  return (
    // The wheels run edge to edge, so a thumb near the side of the sheet turns one rather than dragging it.
    <View style={{ flex: 1, backgroundColor: tokens.card, paddingBottom: insets.bottom + spacing[4] }}>
      <View style={{ paddingHorizontal: spacing.pageHorizontalMargin }}>
        <SheetHeader title={t('exercise_editor.rest.title')} subtitle={exercise.name} onClose={back} />
      </View>
      <RestWheels
        testID="exercise-edit-rest-wheel"
        pick={draft.rest}
        onChange={(pick) => setDraft((d) => ({ ...d, rest: pick }))}
        minutesLabel={t('live_workout.exercise_rest.minutes_wheel.label')}
        secondsLabel={t('live_workout.exercise_rest.seconds_wheel.label')}
      />
      {cardio ? null : (
        <View style={{ paddingHorizontal: spacing.pageHorizontalMargin, marginTop: spacing[4] }}>
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            <ListRow
              testID="exercise-edit-rest-failed-set-row"
              title={failedSetTitle}
              subtitle={failedSetHint}
              accessibilityLabel={`${failedSetTitle}, ${failedSetHint}`}
              onPress={() => toggleFailedSet(!draft.failedSetOn)}
              style={{ minHeight: spacing[16] }}
              trailing={
                <Switch
                  value={draft.failedSetOn}
                  testID="exercise-edit-rest-failed-set"
                  onValueChange={toggleFailedSet}
                />
              }
            />
          </Card>
        </View>
      )}
      {!cardio && draft.failedSetOn ? (
        <View style={{ marginTop: spacing[2] }}>
          <RestWheels
            testID="exercise-edit-rest-failed-set-wheel"
            pick={draft.failedSet}
            onChange={(pick) => setDraft((d) => ({ ...d, failedSet: pick }))}
            minutesLabel={t('exercise_editor.rest_sheet.failed_set.minutes_wheel.label')}
            secondsLabel={t('exercise_editor.rest_sheet.failed_set.seconds_wheel.label')}
          />
        </View>
      ) : null}
      <View style={{ marginTop: spacing[4], paddingHorizontal: spacing.pageHorizontalMargin }}>
        <ActionButton
          testID="exercise-edit-rest-save"
          label={
            cardio && rest.rest.isZero() ? t('exercise_editor.rest_sheet.save_none.button') : restSaveLabelOf(t, rest)
          }
          // Lifting always rests; turning rest timers off is the way to have none. Steady cardio needn't.
          disabled={!cardio && rest.rest.isZero()}
          onPress={save}
        />
      </View>
    </View>
  );
}

function RestWheels(props: {
  testID: string;
  pick: RestPick;
  onChange: (pick: RestPick) => void;
  minutesLabel: string;
  secondsLabel: string;
}) {
  const { t } = useTranslate();
  const { pick, onChange } = props;
  return (
    <WheelPicker
      testID={props.testID}
      columns={[
        {
          key: 'minutes',
          options: REST_PICK_MINUTES.map((m) => ({ value: m, label: String(m) })),
          value: pick.minutes,
          onChange: (minutes) => onChange({ ...pick, minutes }),
          unit: t('live_workout.exercise_rest.minutes.label'),
          accessibilityLabel: props.minutesLabel,
        },
        {
          key: 'seconds',
          options: REST_PICK_SECONDS.map((s) => ({ value: s, label: String(s).padStart(2, '0') })),
          value: pick.seconds,
          onChange: (seconds) => onChange({ ...pick, seconds }),
          unit: t('live_workout.exercise_rest.seconds.label'),
          accessibilityLabel: props.secondsLabel,
        },
      ]}
    />
  );
}
