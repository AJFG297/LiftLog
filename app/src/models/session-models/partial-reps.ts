/** Full reps and optional partials, without treating a partial as a full repetition. */
export function formatCompletedReps(reps: number, partialReps?: number): string {
  return partialReps ? `${reps}+${partialReps}P` : String(reps);
}
