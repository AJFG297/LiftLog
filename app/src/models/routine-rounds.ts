/**
 * How many of a program's routines were done in the current round, from the routine of each workout done,
 * oldest first. A round ends once every routine has been done at least once, in any order, and the next
 * workout starts a new one, so a finished round reads as nothing done yet.
 *
 * Where a round ends depends on every workout before it (A B A B, read from the second workout on, splits
 * into B A rounds instead of A B), so no tail of the history can stand in for the whole of it.
 */
export function routinesDoneThisRoundOf(namesOldestFirst: Iterable<string>, routineNames: readonly string[]): number {
  const names = new Set(routineNames);
  const thisRound = new Set<string>();
  for (const name of namesOldestFirst) {
    if (!names.has(name)) {
      continue;
    }
    thisRound.add(name);
    if (thisRound.size === names.size) {
      thisRound.clear();
    }
  }
  return thisRound.size;
}
