import { HeaderPillButton } from '@/components/presentation/foundation/header-pill-button';
import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import {
  ExerciseEditScope,
  exerciseEditScopeCopy,
  exerciseMetaOf,
} from '@/components/presentation/workout-editor/exercise-edit-copy';
import { showsRestBetweenRounds } from '@/components/presentation/workout-editor/cardio-targets';
import { CardioTargetsPad, useCardioTargetsPad } from '@/components/presentation/workout-editor/cardio-targets-editor';
import { ExerciseEditor } from '@/components/presentation/workout-editor/exercise-editor';
import { blueprintSwappedTo } from '@/components/presentation/workout-editor/exercise-picker';
import { useTargetsPad, WeightedTargetsPad } from '@/components/presentation/workout-editor/weighted-targets-editor';
import { getExerciseLoadHref } from '@/components/smart/exercise-load-sheet';
import { getExerciseEditRestHref } from '@/components/smart/exercise-edit-rest-sheet';
import { getExerciseProgressionHref } from '@/components/smart/exercise-progression-sheet';
import { getEditorWarmupsHref } from '@/components/smart/exercise-warmups-sheet';
import { useOwnedExerciseEdit } from '@/components/smart/exercise-edit-draft';
import { spacing, useAppTheme } from '@/hooks/useAppTheme';
import { useExerciseSearch } from '@/hooks/useExerciseSearch';
import { usePreferredWeightUnit } from '@/hooks/usePreferredWeightUnit';
import { CardioExerciseBlueprint, ExerciseBlueprint, WeightedExerciseBlueprint } from '@/models/blueprint-models';
import { Weight } from '@/models/weight';
import { useAppSelector } from '@/store';
import { selectExercises } from '@/store/stored-sessions';
import { localeFormatBigNumber } from '@/utils/locale-bignumber';
import { useTranslate } from '@tolgee/react';
import BigNumber from 'bignumber.js';
import { useRouter } from 'expo-router';
import { ReactNode, useState } from 'react';
import { View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { Portal } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface ExerciseEditorSheetProps {
  /** The exercise as it was when the sheet opened. */
  exercise: ExerciseBlueprint;
  scope: ExerciseEditScope;
  /** The exercise after this one, named by Superset with next. */
  nextExerciseName: string | undefined;
  /** Each change, as it is made. The caller decides when it lands: at once, or when the sheet closes. */
  onChange: (exercise: ExerciseBlueprint) => void;
  /** Today's heaviest working set, which the Warm-ups sheet resolves percentages against. None in a routine. */
  workingWeight?: Weight;
  /** Anything the entry point adds under the cards, such as the routine's "Copy to another routine". */
  footer?: ReactNode;
}

/**
 * The edit exercise sheet, from a workout or from a routine (PM-43). It owns the exercise being edited
 * (`exercise-edit-draft`) so the sheets it opens over itself, such as Load, can edit it too. The save button
 * names the scope and only closes the sheet: like swiping it away, that keeps the edit.
 */
export function ExerciseEditorSheet(props: ExerciseEditorSheetProps) {
  const { t } = useTranslate();
  const { tokens } = useAppTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const catalog = useAppSelector(selectExercises);
  const restTimersEnabled = useAppSelector((x) => x.settings.restTimersEnabled);
  const useImperialUnits = useAppSelector((x) => x.settings.useImperialUnits);
  const unit = usePreferredWeightUnit();
  const { editId, exercise, update } = useOwnedExerciseEdit(props.exercise, props.onChange);
  // A second tap while the sheet animates away would go back past what opened it.
  const [closing, setClosing] = useState(false);
  const targets = useTargetsPad(exercise, update);
  const cardioTargets = useCardioTargetsPad(exercise, update, useImperialUnits ? 'mile' : 'kilometre');

  const openSearch = useExerciseSearch((picked) =>
    update((current) => blueprintSwappedTo(current, { id: picked.id, name: picked.descriptor.name })),
  );

  const unitLabel = t(unit === 'pounds' ? 'routine_editor.unit.pounds.label' : 'routine_editor.unit.kilograms.label');
  const formatStep = (step: BigNumber) => `${localeFormatBigNumber(step)} ${unitLabel}`;
  const copy = exerciseEditScopeCopy(t, props.scope, exercise.name);

  const save = () => {
    if (closing) {
      return;
    }
    setClosing(true);
    router.back();
  };

  return (
    // The routine's Copy to another routine dialog is a Paper portal, which would otherwise open on the
    // root view behind this native sheet.
    <Portal.Host>
      <View style={{ flex: 1, backgroundColor: tokens.bg }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: spacing[3],
            paddingTop: spacing[5],
            paddingBottom: spacing[2],
            paddingLeft: spacing[5],
            paddingRight: spacing[4],
          }}
        >
          <SurfaceText
            font="text-lg"
            weight="600"
            accessibilityRole="header"
            numberOfLines={1}
            style={{ flexShrink: 1, color: tokens.ink }}
          >
            {t('exercise.edit.title')}
          </SurfaceText>
          <HeaderPillButton testID="exercise-editor-save" label={copy.saveLabel} onPress={save} maxWidth="60%" />
        </View>
        <KeyboardAwareScrollView
          bottomOffset={spacing[4]}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            gap: spacing[5],
            paddingHorizontal: spacing.pageHorizontalMargin,
            paddingTop: spacing[2],
            paddingBottom: insets.bottom + spacing[8],
          }}
        >
          <ExerciseEditor
            exercise={exercise}
            update={update}
            scopeSentence={copy.sentence}
            meta={exerciseMetaOf(t, catalog[exercise.exerciseId])}
            nextExerciseName={props.nextExerciseName}
            restTimersEnabled={restTimersEnabled}
            formatStep={formatStep}
            onSwap={() => openSearch(exercise.name)}
            onOpenLoad={() => router.push(getExerciseLoadHref(editId))}
            onOpenRest={() => router.push(getExerciseEditRestHref(editId))}
            onOpenWarmups={() => router.push(getEditorWarmupsHref(editId, props.scope, props.workingWeight))}
            onOpenProgression={() => router.push(getExerciseProgressionHref(editId))}
            targets={targets}
            cardioTargets={cardioTargets}
          />
          {props.footer}
        </KeyboardAwareScrollView>
        {exercise instanceof WeightedExerciseBlueprint ? (
          <WeightedTargetsPad exercise={exercise} targets={targets} />
        ) : null}
        {exercise instanceof CardioExerciseBlueprint ? (
          <CardioTargetsPad
            exercise={exercise}
            targets={cardioTargets}
            restBetweenRounds={showsRestBetweenRounds(exercise, restTimersEnabled)}
          />
        ) : null}
      </View>
    </Portal.Host>
  );
}
