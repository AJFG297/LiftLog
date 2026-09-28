package expo.modules.workoutworker.utils

import com.limajuice.liftlog.CurrentSetKind

/**
 * The letter the app shows in place of a set's number (SET_KIND_RULES in set-kind.ts). A warm-up's W is
 * left out: the notification names a warm-up in words instead.
 */
fun setKindLetter(kind: CurrentSetKind): String? = when (kind) {
    CurrentSetKind.drop -> "D"
    CurrentSetKind.myo -> "M"
    CurrentSetKind.failure -> "F"
    CurrentSetKind.working, CurrentSetKind.warmup -> null
}

/** `5`, `8-12`, or `D 12` for a set that isn't a working set, as the app's formatPlannedSets writes it. */
fun formatSetTarget(kind: CurrentSetKind, min: Long, max: Long): String {
    val reps = if (min == max) "$max" else "$min-$max"
    return setKindLetter(kind)?.let { "$it $reps" } ?: reps
}
