import { diffSessionBlueprints, PlanDiff } from '@/models/blueprint-diff';
import { ProgramBlueprint } from '@/models/blueprint-models';
import { findRoutineIndex } from '@/models/routine-identity';
import { EmptySession, Session } from '@/models/session-models';
import { routineChanges } from '@/models/routine-update';

/**
 * Computes how a finished session differs from the active plan, or `undefined` if the session already
 * matches a workout in the plan or differs only in what progression moves (weights and rep targets), so
 * there is nothing to ask about.
 */
export function getPlanDiff(
  program: ProgramBlueprint,
  session: Session,
  programId: string,
  liveRoutineIds?: ReadonlySet<string>,
): PlanDiff | undefined {
  const sessionInPlan = program.sessions.some((x) => x.equals(session.blueprint));
  if (sessionInPlan) {
    return undefined;
  }

  const planDiff = planDiffFor(program, session, programId, liveRoutineIds);
  return routineChanges(planDiff.diff).length > 0 ? planDiff : undefined;
}

function planDiffFor(
  program: ProgramBlueprint,
  session: Session,
  programId: string,
  liveRoutineIds?: ReadonlySet<string>,
): PlanDiff {
  const index = findRoutineIndex(program.sessions, session.blueprint, liveRoutineIds);
  const matched = index >= 0 ? program.sessions[index] : undefined;
  if (!matched) {
    return {
      type: 'add',
      programId,
      diff: diffSessionBlueprints(EmptySession.blueprint, session.blueprint),
    };
  }
  // The workout still carries the name it was started under. Compare against that name so a
  // confirmed diff does not revert a rename, while keeping the routine's current name on
  // `originalSession` for the update sheet and confirmation message.
  const comparable =
    matched.id && matched.id === session.blueprint.id && matched.name !== session.blueprint.name
      ? matched.withName(session.blueprint.name)
      : matched;
  const diff = diffSessionBlueprints(comparable, session.blueprint);
  return {
    type: 'diff',
    programId,
    diff: comparable === matched ? diff : { ...diff, originalSession: matched },
    sessionIndex: index,
  };
}
