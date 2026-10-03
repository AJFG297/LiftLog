import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { ExerciseHistoryList } from '@/components/presentation/workout/exercise-history-list';
import { spacing } from '@/hooks/useAppTheme';
import { ExerciseBlueprint, ExerciseId, movementKeyFor } from '@/models/blueprint-models';
import { useWorkoutQuery } from '@/hooks/useWorkoutQuery';
import { useAppSelectorWithArg } from '@/store';
import { selectExerciseById } from '@/store/stored-sessions';
import { Href } from 'expo-router';
import { useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

/** Performances read per page; the sheet asks for the next page as it scrolls to the end. */
const PAGE_SIZE = 20;

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
  // Pages are counted per movement, so another exercise starts again at the first page.
  const [page, setPage] = useState({ movement, limit: PAGE_SIZE });
  const limit = page.movement === movement ? page.limit : PAGE_SIZE;
  // The pages already shown stay on screen while the next one loads, but never under another exercise.
  const loaded = useWorkoutQuery(
    async (repository) => ({
      movement,
      exercises: (await repository.previousPerformances([movement], { limit })).get(movement) ?? [],
    }),
    [movement, limit],
    { keepPrevious: true },
  );
  const exercises = loaded?.movement === movement ? loaded.exercises : [];
  // A full page means there may be more; a short one is the end of the history.
  const loadMore = () => {
    if (exercises.length >= limit) {
      setPage({ movement, limit: limit + PAGE_SIZE });
    }
  };
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
        onEndReached={loadMore}
        contentContainerStyle={{
          paddingHorizontal: spacing.pageHorizontalMargin,
          paddingTop: spacing[2],
          paddingBottom: spacing[8],
        }}
      />
    </SafeAreaView>
  );
}
