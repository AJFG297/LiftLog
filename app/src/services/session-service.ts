import {
  ProgressionKey,
  SessionBlueprint,
  ExerciseBlueprint,
  CardioExerciseBlueprint,
  applyProgression,
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
import { setKindCounts } from '@/models/session-models/set-kind';
import { ProgressRepository } from '@/services/progress-repository';
import type { RootState } from '@/store';
import { selectActiveSession } from '@/store/stored-sessions';
import { uuid } from '@/utils/uuid';
import { LocalDate } from '@js-joda/core';
import { match } from 'ts-pattern';

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
    latestRecordedExercises: Record<ProgressionKey, RecordedExercise | undefined>,
  ): Session {
    // oxlint-disable-next-line typescript/no-this-alias
    const $this = this;
    function getNextExercise(e: ExerciseBlueprint): RecordedExercise {
      const lastExercise = latestRecordedExercises[e.progressionKey()];
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
      const potentialSets: PotentialSet[] = match(weightedLastExercise)
        .returnType<PotentialSet[]>()
        .with(undefined, () =>
          e.plannedSets.map((s) =>
            PotentialSet.of({ weight: new Weight(0, $this.getDefaultWeightUnit()), target: s.reps, kind: s.kind }),
          ),
        )
        // Where reps are what advances, the target carries forward alongside the weight so the
        // lineage keeps what a rule won for it. Where they are a fixed prescription it is re-seeded
        // from the plan, because the only thing that could have changed it is an edit to the plan -
        // and that edit already had its own say in the save-changes dialog.
        // A slot only picks up where the last one left off when both are kinds that carry over: a drop
        // set's lighter weight is not the next working set's, and a drop set starts fresh either way.
        .otherwise((x) =>
          x.potentialSets.map((ps, index) => {
            const kind = e.plannedSets[index]?.kind ?? 'working';
            const carries = setKindCounts(ps.kind, 'carriesOver') && setKindCounts(kind, 'carriesOver');
            return PotentialSet.of({
              weight: carries
                ? ps.weight
                : new Weight(0, ps.weight.unit === 'nil' ? $this.getDefaultWeightUnit() : ps.weight.unit),
              target: carries && e.repsAreProgressed ? ps.target : e.repsTargetForSet(index),
              kind,
            });
          }),
        );
      const newExercise = new RecordedWeightedExercise(e, potentialSets, undefined);
      const progressed = weightedLastExercise?.isSuccessForProgressiveOverload
        ? applyProgression(e.progression, newExercise)
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
