import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { ExerciseHistoryList } from '@/components/presentation/workout/exercise-history-list';
import { spacing } from '@/hooks/useAppTheme';
import { ExerciseBlueprint, ExerciseId, movementKeyFor } from '@/models/blueprint-models';
import { useWorkoutQuery } from '@/hooks/useWorkoutQuery';
import { useAppSelectorWithArg } from '@/store';
import { selectExerciseById } from '@/store/stored-sessions';
import { Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

/** By id, so the sheet shows the exercise's whole history whatever it was called at the time. */
export function getExerciseHistoryHref(blueprint: ExerciseBlueprint): Href {
  return `/exercise-history?exerciseId=${encodeURIComponent(blueprint.exerciseId)}&type=${blueprint.type}&name=${encodeURIComponent(blueprint.name)}` as Href;
}

export function ExerciseHistory(props: {
  exerciseId: ExerciseId;
  type: ExerciseBlueprint['type'];
  exerciseName: string;
}) {
  // No session to exclude: this sheet is opened from an exercise, and shows the whole lineage.
  const movement = movementKeyFor(props.exerciseId, props.type);
  const exercises =
    useWorkoutQuery((repository) => repository.previousPerformances([movement]), [movement])?.get(movement) ?? [];
  // The exercise's current name, which a rename in the exercise list may have changed.
  const title = useAppSelectorWithArg(selectExerciseById, props.exerciseId)?.name ?? props.exerciseName;

  return (
    <SafeAreaView edges={{ left: 'additive', right: 'additive', top: 'off', bottom: 'off' }} style={{ flex: 1 }}>
      <SurfaceText
        font="text-xl"
        weight="bold"
        numberOfLines={1}
        style={{ paddingHorizontal: spacing.pageHorizontalMargin, paddingTop: spacing[3] }}
      >
        {title}
      </SurfaceText>
      <ExerciseHistoryList
        exercises={exercises}
        contentContainerStyle={{
          paddingHorizontal: spacing.pageHorizontalMargin,
          paddingTop: spacing[2],
          paddingBottom: spacing[8],
        }}
      />
    </SafeAreaView>
  );
}
