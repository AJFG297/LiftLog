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
export function getPlanDiff(program: ProgramBlueprint, session: Session, programId: string): PlanDiff | undefined {
  const sessionInPlan = program.sessions.some((x) => x.equals(session.blueprint));
  if (sessionInPlan) {
    return undefined;
  }

  const planDiff = planDiffFor(program, session, programId);
  return routineChanges(planDiff.diff).length > 0 ? planDiff : undefined;
}

function planDiffFor(program: ProgramBlueprint, session: Session, programId: string): PlanDiff {
  const index = findRoutineIndex(program.sessions, session.blueprint);
  const matched = index >= 0 ? program.sessions[index] : undefined;
  // The workout still carries the name it was started under. Compare it with the routine as that
  // name, so a rename is not a change to write back onto the routine.
  const comparable =
    matched?.id && matched.id === session.blueprint.id && matched.name !== session.blueprint.name
      ? matched.withName(session.blueprint.name)
      : matched;
  return comparable
    ? {
        type: 'diff',
        programId,
        diff: diffSessionBlueprints(comparable, session.blueprint),
        sessionIndex: index,
      }
    : {
        type: 'add',
        programId,
        diff: diffSessionBlueprints(EmptySession.blueprint, session.blueprint),
      };
}
