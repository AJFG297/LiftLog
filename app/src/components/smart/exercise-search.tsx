import Button from '@/components/presentation/foundation/button';
import ExerciseFilterer from '@/components/presentation/workout-editor/exercise-filterer';
import { filterExercises, searchSeedFor } from '@/components/presentation/workout-editor/filter-exercises';
import { spacing } from '@/hooks/useAppTheme';
import { ExerciseDescriptor } from '@/models/exercise-models';
import { useAppSelector, useAppSelectorWithArg } from '@/store';
import { PickedExercise, setExerciseSearchResult } from '@/store/app';
import { selectExerciseById, selectExercises, updateExercise } from '@/store/stored-sessions';
import { uuid } from '@/utils/uuid';
import { LegendList } from '@legendapp/list';
import { useTranslate } from '@tolgee/react';
import { Stack, useRouter } from 'expo-router';
import { HeaderHeightContext } from 'expo-router/react-navigation';
import { useContext, useMemo, useState } from 'react';
import { Platform, View } from 'react-native';
import { List } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useDispatch } from 'react-redux';

export function ExerciseSearch(props: { requestId: string; exerciseName: string }) {
  const { t } = useTranslate();
  const dispatch = useDispatch();
  const { dismiss } = useRouter();
  const exercises = useAppSelector(selectExercises);
  // The field opens with the exercise's name when it names one, so the list must start filtered by it.
  const [seed] = useState(() => searchSeedFor(exercises, props.exerciseName));
  const [initialResult] = useState(() => filterExercises(exercises, seed, []));
  const [filteredExerciseIds, setFilteredExerciseIds] = useState(initialResult.ids);
  const [suggestedNewExercise, setSuggestedNewExercise] = useState(initialResult.suggestion);

  const exerciseListItems = useMemo(
    () => ['filter', suggestedNewExercise, ...filteredExerciseIds] as const,
    [filteredExerciseIds, suggestedNewExercise],
  );

  const onSelect = (exercise: PickedExercise) => {
    dispatch(setExerciseSearchResult({ requestId: props.requestId, exercise }));
    dismiss();
  };

  const headerHeight = useContext(HeaderHeightContext); // Intentionally don't use useHeaderHeight as it might not be in a stack
  const topInsetHeight = Platform.select({ ios: headerHeight }) ?? 0;

  return (
    <SafeAreaView
      edges={{
        left: 'additive',
        right: 'additive',
        top: Platform.OS === 'ios' ? 'additive' : 'off',
        bottom: 'additive',
      }}
      style={{ flex: 1, insetBlockStart: topInsetHeight }}
    >
      <Stack.Screen options={{ title: t('generic.search.button') }} />
      <LegendList
        data={exerciseListItems}
        getItemType={(_, index) => (index === 0 ? 'filters' : index === 1 ? 'suggest' : 'exercise')}
        keyExtractor={(item, index) => (index === 0 ? 'filters' : index === 1 ? 'suggest' : (item as string))}
        renderItem={(i) => {
          if (i.index === 0) {
            return (
              <ExerciseFilterer
                exerciseName={seed}
                onSuggestedNewExercise={setSuggestedNewExercise}
                onFilteredExerciseIdsChange={setFilteredExerciseIds}
              />
            );
          }
          if (i.index === 1) {
            return i.item !== 'NONE' ? (
              <SuggestedExerciseSearchListItem exercise={i.item as ExerciseDescriptor} onPress={onSelect} />
            ) : undefined;
          }
          return <ExerciseIdSearchListItem exerciseId={i.item as string} onPress={onSelect} />;
        }}
      />
    </SafeAreaView>
  );
}

function ExerciseIdSearchListItem(props: { exerciseId: string; onPress: (exercise: PickedExercise) => void }) {
  const exercise = useAppSelectorWithArg(selectExerciseById, props.exerciseId);
  if (!exercise) {
    return <List.Item title={'Unknown'} />;
  }
  return (
    <List.Item title={exercise.name} onPress={() => props.onPress({ id: props.exerciseId, descriptor: exercise })} />
  );
}

function SuggestedExerciseSearchListItem(props: {
  exercise: ExerciseDescriptor;
  onPress: (exercise: PickedExercise) => void;
}) {
  const dispatch = useDispatch();
  return (
    <View style={{ padding: spacing.pageHorizontalMargin }}>
      <Button
        icon={'plus'}
        mode="outlined"
        onPress={() => {
          const id = uuid();
          dispatch(updateExercise({ id, exercise: props.exercise }));
          props.onPress({ id, descriptor: props.exercise });
        }}
      >
        Add {props.exercise.name}
      </Button>
    </View>
  );
}
