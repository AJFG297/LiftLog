import { HeaderPillButton } from '@/components/presentation/foundation/header-pill-button';
import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { ProgressionSheetContent } from '@/components/presentation/workout-editor/progression-sheet';
import { plannedTargetsOf } from '@/components/presentation/workout-editor/progression-sheet-copy';
import { updateExerciseEdit, useExerciseEdit } from '@/components/smart/exercise-edit-draft';
import { useBackWhenGone } from '@/hooks/useBackWhenGone';
import { spacing, useAppTheme } from '@/hooks/useAppTheme';
import { WeightedExerciseBlueprint } from '@/models/blueprint-models';
import { equipmentClassOf, weightStepFor } from '@/models/equipment';
import { RecordedWeightedExercise } from '@/models/session-models';
import { useAppSelector } from '@/store';
import { selectPreferredWeightUnit } from '@/store/settings';
import { selectExercises, selectLatestExercises } from '@/store/stored-sessions';
import { localeFormatBigNumber } from '@/utils/locale-bignumber';
import { useTranslate } from '@tolgee/react';
import BigNumber from 'bignumber.js';
import { Href, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** The Progression sheet over the edit exercise sheet, editing the exercise open there. */
export function getExerciseProgressionHref(editId: string): Href {
  return { pathname: '/exercise-progression', params: { editId } } as unknown as Href;
}

/**
 * How the exercise open in the edit exercise sheet progresses (PM-48). Opened from its Progression row;
 * each change lands in the edit at once, so Done, like a swipe, only closes.
 */
export function ExerciseProgressionSheet() {
  const { editId } = useLocalSearchParams<{ editId?: string }>();
  const { t } = useTranslate();
  const { tokens } = useAppTheme();
  const { back } = useRouter();
  const insets = useSafeAreaInsets();
  const unit = useAppSelector(selectPreferredWeightUnit);
  const catalog = useAppSelector(selectExercises);
  const latest = useAppSelector(selectLatestExercises);
  const exercise = useExerciseEdit(editId ?? '');
  const weighted = exercise instanceof WeightedExerciseBlueprint ? exercise : undefined;
  // A second tap on Done while the sheet animates away would go back past the editor.
  const [closing, setClosing] = useState(false);
  useBackWhenGone(!weighted && !closing);

  if (!weighted) {
    return null;
  }

  const unitLabel = t(unit === 'pounds' ? 'routine_editor.unit.pounds.label' : 'routine_editor.unit.kilograms.label');
  const formatWeight = (weight: BigNumber) => `${localeFormatBigNumber(weight)} ${unitLabel}`;
  // The preview opens on the weight the next workout would: the best set last time this exercise was done.
  const last = latest[weighted.progressionKey()];
  const startWeight =
    weighted.resistance !== 'none' && last instanceof RecordedWeightedExercise
      ? last.bestSet?.weight.convertTo(unit).value
      : undefined;
  const targets = plannedTargetsOf(weighted);
  const subtitle = startWeight
    ? t('progression_sheet.subtitle_with_weight', { name: weighted.name, targets, weight: formatWeight(startWeight) })
    : t('progression_sheet.subtitle', { name: weighted.name, targets });

  return (
    <View style={{ flex: 1, backgroundColor: tokens.card }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing[3],
          paddingTop: spacing[5],
          paddingBottom: spacing[3],
          paddingHorizontal: spacing.pageHorizontalMargin,
        }}
      >
        <View accessible accessibilityRole="header" style={{ flex: 1, gap: 2 }}>
          <SurfaceText font="text-xl" weight="700" style={{ color: tokens.ink }}>
            {t('progression_sheet.title')}
          </SurfaceText>
          <SurfaceText font="text-sm" numberOfLines={2} style={{ color: tokens.muted }}>
            {subtitle}
          </SurfaceText>
        </View>
        <HeaderPillButton
          testID="progression-done"
          label={t('progression_sheet.done.button')}
          onPress={() => {
            if (!closing) {
              setClosing(true);
              back();
            }
          }}
        />
      </View>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: spacing.pageHorizontalMargin,
          paddingBottom: insets.bottom + spacing[6],
        }}
      >
        <ProgressionSheetContent
          exercise={weighted}
          fallbackStep={weightStepFor(
            equipmentClassOf(catalog[weighted.exerciseId]?.equipment ?? null),
            unit,
            weighted.weightIncrement,
          )}
          formatStep={formatWeight}
          formatWeight={formatWeight}
          startWeight={startWeight}
          onChange={(progression) =>
            updateExerciseEdit(editId ?? '', (current) =>
              current instanceof WeightedExerciseBlueprint ? current.with({ progression }) : current,
            )
          }
        />
      </ScrollView>
    </View>
  );
}
