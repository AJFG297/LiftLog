import { SessionBlueprint } from '@/models/blueprint-models';
import { WeightUnit } from '@/models/weight';
import { Session } from '@/models/session-models';
import { LatestByLineage, nextSessionExercises } from '@/models/session-models/next-exercise';
import type { WorkoutRepository } from '@/services/workout-repository';
import type { RootState } from '@/store';
import { selectActiveSession } from '@/store/stored-sessions';
import { uuid } from '@/utils/uuid';
import { LocalDate } from '@js-joda/core';

/** What {@link SessionService} reads of the workout tables: where the plan is up to. */
export type PlanPositionSource = Pick<WorkoutRepository, 'latestPlanned'>;

export class SessionService {
  constructor(
    private workoutRepository: PlanPositionSource,
    private getState: () => RootState,
  ) {}

  async *getUpcomingSessions(
    sessionBlueprints: SessionBlueprint[],
    latestExercises: LatestByLineage,
  ): AsyncIterableIterator<Session> {
    const currentState = this.getState();
    const currentSession = selectActiveSession(currentState);

    const firstSessionBlueprint = sessionBlueprints[0];
    if (!firstSessionBlueprint) {
      return;
    }
    await yieldToEventLoop();

    let latestSession = currentSession ?? (await this.workoutRepository.latestPlanned());

    await yieldToEventLoop();
    // Track the plan position by index so progression walks the plan in order.
    // Matching only by name would stall on duplicate-named workouts, always
    // resolving to the first one and never advancing past it.
    let index: number;
    if (!latestSession) {
      latestSession = this.createNewSession(firstSessionBlueprint, latestExercises);
      index = 0;
      yield latestSession;
    } else {
      index = sessionBlueprints.findIndex((x) => x.name === latestSession!.blueprint.name);
    }

    while (true) {
      index = (index + 1) % sessionBlueprints.length;
      latestSession = this.createNewSession(sessionBlueprints[index]!, latestExercises).with({
        bodyweight: latestSession.bodyweight,
      });
      yield latestSession;
    }
  }

  public hydrateSessionFromBlueprint(blueprint: SessionBlueprint, latestExercises: LatestByLineage): Session {
    return this.createNewSession(blueprint, latestExercises);
  }

  private createNewSession(sessionBlueprint: SessionBlueprint, latestRecordedExercises: LatestByLineage): Session {
    return new Session(
      uuid(),
      sessionBlueprint,
      nextSessionExercises(sessionBlueprint, latestRecordedExercises, this.getDefaultWeightUnit()),
      LocalDate.now(),
      undefined,
      undefined,
    );
  }

  private getDefaultWeightUnit(): WeightUnit {
    return this.getState().settings.useImperialUnits ? 'pounds' : 'kilograms';
  }
}

// Helper function to yield control back to the event loop
const yieldToEventLoop = () => new Promise((resolve) => setTimeout(resolve, 5));
