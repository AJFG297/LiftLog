package expo.modules.workoutworker.utils

import com.limajuice.liftlog.CurrentExerciseDetails
import com.limajuice.liftlog.CurrentSetKind
import com.limajuice.liftlog.PotentialSet
import com.limajuice.liftlog.RecordedWeightedExercise

/**
 * The weighted set the app says comes next. The app owns the ordering - warm-ups first, until the
 * working sets begin - and sends its answer as `setKind` + `setIndex`, so the worker only looks the
 * slot up rather than deciding for itself.
 *
 * [slot] is null once every working set is logged, so a finished exercise stops advertising a weight.
 */
data class CurrentWeightedSet(
    val exercise: RecordedWeightedExercise,
    val kind: CurrentSetKind,
    val index: Int,
    val slot: PotentialSet?,
) {
    val isWarmup get() = kind == CurrentSetKind.warmup
}

fun currentWeightedSetOf(details: CurrentExerciseDetails?): CurrentWeightedSet? {
    val exercise = details?.exercise as? RecordedWeightedExercise ?: return null
    val index = details.setIndex.toInt()
    val sets = if (details.setKind == CurrentSetKind.warmup) exercise.warmupSets else exercise.potentialSets
    return CurrentWeightedSet(exercise, details.setKind, index, sets.getOrNull(index))
}
