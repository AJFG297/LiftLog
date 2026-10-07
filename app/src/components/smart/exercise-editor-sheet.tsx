import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { MIN_TOUCH_TARGET } from '@/components/presentation/foundation/touch-target';
import {
  ExerciseEditScope,
  exerciseEditScopeCopy,
  exerciseMetaOf,
} from '@/components/presentation/workout-editor/exercise-edit-copy';
import { ExerciseEditor } from '@/components/presentation/workout-editor/exercise-editor';
import { blueprintSwappedTo } from '@/components/presentation/workout-editor/exercise-picker';
import { useTargetsPad, WeightedTargetsPad } from '@/components/presentation/workout-editor/weighted-targets-editor';
import { getExerciseLoadHref } from '@/components/smart/exercise-load-sheet';
import { getExerciseEditRestHref } from '@/components/smart/exercise-edit-rest-sheet';
import { useOwnedExerciseEdit } from '@/components/smart/exercise-edit-draft';
import { spacing, useAppTheme } from '@/hooks/useAppTheme';
import { useExerciseSearch } from '@/hooks/useExerciseSearch';
import { usePreferredWeightUnit } from '@/hooks/usePreferredWeightUnit';
import { ExerciseBlueprint, WeightedExerciseBlueprint } from '@/models/blueprint-models';
import { useAppSelector } from '@/store';
import { selectExercises } from '@/store/stored-sessions';
import { localeFormatBigNumber } from '@/utils/locale-bignumber';
import { useTranslate } from '@tolgee/react';
import BigNumber from 'bignumber.js';
import { useRouter } from 'expo-router';
import { ReactNode, useState } from 'react';
import { Pressable, View } from 'react-native';
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
  const unit = usePreferredWeightUnit();
  const { editId, exercise, update } = useOwnedExerciseEdit(props.exercise, props.onChange);
  // A second tap while the sheet animates away would go back past what opened it.
  const [closing, setClosing] = useState(false);
  const targets = useTargetsPad(exercise, update);

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
    // The Rest dialog and the progression example are Paper portals, which would otherwise open on the
    // root view behind this native sheet. Goes once those become sheets of their own (PM-46, PM-48).
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
          <SaveButton label={copy.saveLabel} onPress={save} />
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
            targets={targets}
          />
          {props.footer}
        </KeyboardAwareScrollView>
        {exercise instanceof WeightedExerciseBlueprint ? (
          <WeightedTargetsPad exercise={exercise} targets={targets} />
        ) : null}
      </View>
    </Portal.Host>
  );
}

/** The accent pill in the header that names where the edit goes: "Save for today", "Save to Push A". */
function SaveButton({ label, onPress }: { label: string; onPress: () => void }) {
  const { tokens } = useAppTheme();
  return (
    <Pressable
      testID="exercise-editor-save"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{ minHeight: MIN_TOUCH_TARGET, justifyContent: 'center', flexShrink: 0, maxWidth: '60%' }}
    >
      {({ pressed }) => (
        <View
          style={{
            minHeight: 36,
            borderRadius: 18,
            paddingHorizontal: spacing[4],
            justifyContent: 'center',
            backgroundColor: tokens.accent,
            opacity: pressed ? 0.85 : 1,
          }}
        >
          <SurfaceText font="text-base" weight="600" numberOfLines={1} style={{ color: tokens.onAccent }}>
            {label}
          </SurfaceText>
        </View>
      )}
    </Pressable>
  );
}
