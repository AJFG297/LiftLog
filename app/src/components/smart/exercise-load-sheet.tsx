import { haptics } from '@/components/presentation/foundation/haptics';
import { SheetHeader } from '@/components/presentation/foundation/sheet-header';
import { SetTypeOption } from '@/components/presentation/live-workout/set-type-option';
import { LOAD_OPTIONS } from '@/components/presentation/workout-editor/exercise-edit-copy';
import { updateExerciseEdit, useExerciseEdit } from '@/components/smart/exercise-edit-draft';
import { useBackWhenGone } from '@/hooks/useBackWhenGone';
import { spacing, useAppTheme } from '@/hooks/useAppTheme';
import { Resistance, WeightedExerciseBlueprint } from '@/models/blueprint-models';
import { useTranslate } from '@tolgee/react';
import { Href, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** The Load sheet over the edit exercise sheet, editing the exercise open there. */
export function getExerciseLoadHref(editId: string): Href {
  return { pathname: '/exercise-load', params: { editId } } as unknown as Href;
}

/**
 * Picks what the weight of a set means (external, bodyweight or none), each choice with what it changes.
 * Opened from the edit exercise sheet's Load row; a pick applies and closes.
 */
export function ExerciseLoadSheet() {
  const { editId } = useLocalSearchParams<{ editId?: string }>();
  const { t } = useTranslate();
  const { tokens } = useAppTheme();
  const { back } = useRouter();
  const insets = useSafeAreaInsets();
  const exercise = useExerciseEdit(editId ?? '');
  const weighted = exercise instanceof WeightedExerciseBlueprint ? exercise : undefined;
  // A second tap while the sheet animates away would go back past the editor.
  const [picked, setPicked] = useState<Resistance>();
  useBackWhenGone(!weighted && !picked);

  if (!weighted) {
    return null;
  }

  const pick = (resistance: Resistance) => {
    if (picked) {
      return;
    }
    haptics.selection();
    setPicked(resistance);
    updateExerciseEdit(editId ?? '', (current) =>
      current instanceof WeightedExerciseBlueprint ? current.with({ resistance }) : current,
    );
    back();
  };

  return (
    <View style={{ flex: 1, backgroundColor: tokens.card, paddingHorizontal: spacing.pageHorizontalMargin }}>
      <SheetHeader title={t('exercise_editor.load.title')} subtitle={weighted.name} onClose={back} />
      <ScrollView
        accessibilityRole="radiogroup"
        contentContainerStyle={{ gap: spacing[2], paddingBottom: insets.bottom + spacing[4] }}
      >
        {LOAD_OPTIONS.map((option) => (
          <SetTypeOption
            key={option.value}
            testID={`load-${option.value}`}
            name={t(option.label)}
            description={t(option.body)}
            selected={(picked ?? weighted.resistance) === option.value}
            onPress={() => pick(option.value)}
          />
        ))}
      </ScrollView>
    </View>
  );
}
