import {
  ProgressionKey,
  SessionBlueprint,
  ExerciseBlueprint,
  CardioExerciseBlueprint,
  applyEarnedProgression,
  latestInLineage,
  lineageKeys,
} from '@/models/blueprint-models';
import { Weight, WeightUnit } from '@/models/weight';
import {
  PotentialSet,
  RecordedCardioExercise,
  RecordedCardioExerciseSet,
  RecordedExercise,
  RecordedWeightedExercise,
  Session,
} from '@/models/session-models';
import { ProgressRepository } from '@/services/progress-repository';
import type { RootState } from '@/store';
import { selectActiveSession } from '@/store/stored-sessions';
import { uuid } from '@/utils/uuid';
import { LocalDate } from '@js-joda/core';

export class SessionService {
  constructor(
    private progressRepository: ProgressRepository,
    private getState: () => RootState,
  ) {}

  async *getUpcomingSessions(
    sessionBlueprints: SessionBlueprint[],
    latestExercises: Record<ProgressionKey, RecordedExercise | undefined>,
  ): AsyncIterableIterator<Session> {
    const currentState = this.getState();
    const currentSession = selectActiveSession(currentState);

    const firstSessionBlueprint = sessionBlueprints[0];
    if (!firstSessionBlueprint) {
      return;
    }
    await yieldToEventLoop();

    let latestSession =
      currentSession ?? this.progressRepository.getOrderedSessions().firstOrDefault((x) => !x.isFreeform);

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

  public hydrateSessionFromBlueprint(
    blueprint: SessionBlueprint,
    latestExercises: Record<ProgressionKey, RecordedExercise | undefined>,
  ): Session {
    return this.createNewSession(blueprint, latestExercises);
  }

  private createNewSession(
    sessionBlueprint: SessionBlueprint,
    // Keyed by lineage (see `lineageKeys`), as the store's `latestExercises` is.
    latestRecordedExercises: Record<ProgressionKey, RecordedExercise | undefined>,
  ): Session {
    // oxlint-disable-next-line typescript/no-this-alias
    const $this = this;
    const lineages = lineageKeys(sessionBlueprint.exercises);
    function getNextExercise(e: ExerciseBlueprint, index: number): RecordedExercise {
      const lastExercise = latestInLineage(latestRecordedExercises, lineages[index]!);
      if (e instanceof CardioExerciseBlueprint) {
        const cardioLastExercise = lastExercise instanceof RecordedCardioExercise ? lastExercise : undefined;
        return RecordedCardioExercise.empty(e).with({
          sets: e.sets.map((s, i) =>
            RecordedCardioExerciseSet.empty(s).with({
              incline: cardioLastExercise?.sets[i]?.incline,
              resistance: cardioLastExercise?.sets[i]?.resistance,
            }),
          ),
        });
      }
      const weightedLastExercise = lastExercise instanceof RecordedWeightedExercise ? lastExercise : undefined;
      const unit = $this.getDefaultWeightUnit();
      const newExercise = weightedLastExercise
        ? weightedLastExercise.carriedInto(e, unit)
        : new RecordedWeightedExercise(
            e,
            e.plannedSets.map((s) => PotentialSet.of({ weight: new Weight(0, unit), target: s.reps, kind: s.kind })),
            undefined,
          );
      const progressed = weightedLastExercise
        ? applyEarnedProgression(e.progression, newExercise, weightedLastExercise)
        : newExercise;
      // Built from the plan rather than carried, and only now, so a percentage follows today's
      // progressed working weight.
      return progressed.withWarmupsFromPlan($this.getDefaultWeightUnit());
    }
    return new Session(
      uuid(),
      sessionBlueprint,
      sessionBlueprint.exercises.map(getNextExercise),
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
