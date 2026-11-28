import { AccordionItem } from '@/components/presentation/foundation/accordion-item';
import { Card } from '@/components/presentation/foundation/card';
import { SearchField } from '@/components/presentation/foundation/search-field';
import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import ExerciseMuscleSelector from '@/components/presentation/workout-editor/exercise-muscle-selector';
import { spacing, useAppTheme } from '@/hooks/useAppTheme';
import { useTranslate } from '@tolgee/react';
import { translateExerciseMeta } from '@/utils/exercise-meta';
import { useState } from 'react';
import { View } from 'react-native';
import IconButton from '@/components/presentation/foundation/icon-button';

export default function ExerciseSearchAndFilters({
  searchText,
  setSearchText,
  muscleFilters,
  setMuscleFilters,
}: {
  searchText: string;
  setSearchText: (text: string) => void;
  muscleFilters: string[];
  setMuscleFilters: (muscles: string[]) => void;
}) {
  const { t } = useTranslate();
  const { tokens } = useAppTheme();
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const selectedFiltersSubtitle =
    muscleFilters.map((m) => translateExerciseMeta(t, 'muscle', m)).join(', ') || 'No filters applied';

  return (
    <View style={{ gap: spacing[2] }}>
      <View style={{ marginHorizontal: spacing.pageHorizontalMargin }}>
        {/* The input's testID is `exercise-search-input`, which the Maestro flows tap. */}
        <SearchField
          testID="exercise-search"
          value={searchText}
          onChange={setSearchText}
          placeholder={t('generic.search.button')}
          accessibilityLabel={t('generic.search.button')}
          clearLabel={t('exercise_picker.search.clear.button')}
        />
      </View>

      <Card style={{ marginHorizontal: spacing.pageHorizontalMargin }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
          <View style={{ flex: 1, gap: spacing[0.5] }}>
            <SurfaceText font="text-base" weight="600">
              {t('generic.filters.title')}
            </SurfaceText>
            <SurfaceText font="text-sm" style={{ color: tokens.muted }}>
              {selectedFiltersSubtitle}
            </SurfaceText>
          </View>
          <IconButton
            icon={filtersExpanded ? 'expandCircleUp' : 'expandCircleDown'}
            testID="expand-filters-btn"
            mode="contained-tonal"
            accessibilityLabel={t('generic.filters.title')}
            onPress={() => {
              setFiltersExpanded(!filtersExpanded);
            }}
          />
        </View>
        <AccordionItem isExpanded={filtersExpanded}>
          <View style={{ paddingTop: spacing[2] }}>
            <ExerciseMuscleSelector muscles={muscleFilters} onChange={setMuscleFilters} />
          </View>
        </AccordionItem>
      </Card>
    </View>
  );
}
