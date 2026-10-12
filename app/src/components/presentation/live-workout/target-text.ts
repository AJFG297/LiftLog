import { formatWeightText } from '@/components/presentation/foundation/weight-format';
import { formatRepsTarget } from '@/models/blueprint-models';
import { LastTime, TargetReason, TodaysTarget } from '@/models/session-models/todays-target';
import type { TranslateFn } from '@/i18n/translate-fn';

/** "87.5 kg × 5", "BW +10 kg × 8-12", or "12 reps" for a movement with no load. */
export function targetLabel(t: TranslateFn, target: TodaysTarget, usesBodyweight: boolean): string {
  const reps = formatRepsTarget(target.reps);
  if (!target.weight) {
    return t('live_workout.target.reps_only.label', { reps });
  }
  return `${formatWeightText(target.weight, usesBodyweight, t('exercise.short_bodyweight.label'))} × ${reps}`;
}

/**
 * Why the target is what it is. `sentence` is the line under the workout's "Today:", with last time's sets
 * after a rise; `short` follows a routine's name on the exercise page's Next time card ("you hit 8 reps, so
 * +2.5 kg"). One switch for both, so the two never give different reasons.
 */
export function targetReasonText(
  t: TranslateFn,
  reason: TargetReason,
  length: 'sentence' | 'short' = 'sentence',
): string {
  const short = length === 'short';
  const lastTime = (summary: LastTime | undefined) =>
    summary && !short ? ` ${t('live_workout.target.last_time.body', { sets: summary.sets, reps: summary.reps })}` : '';
  switch (reason.kind) {
    case 'firstTime':
      return short ? t('progress.exercise.next.reason.first_time.label') : t('live_workout.target.first_time.body');
    case 'newScheme':
      return short ? t('progress.exercise.next.reason.new_scheme.label') : t('live_workout.target.new_scheme.body');
    case 'weightUp': {
      const weight = formatWeightText(reason.by);
      if (!short) {
        return t('live_workout.target.weight_up.body', { weight }) + lastTime(reason.lastTime);
      }
      return reason.lastTime
        ? t('progress.exercise.next.reason.weight_up_hit.label', { reps: reason.lastTime.reps, weight })
        : t('progress.exercise.next.reason.weight_up.label', { weight });
    }
    case 'weightDown': {
      const weight = formatWeightText(reason.by);
      return short
        ? t('progress.exercise.next.reason.weight_down.label', { weight })
        : t('live_workout.target.weight_down.body', { weight });
    }
    case 'repsUp':
      if (reason.by === 1) {
        return short
          ? t('progress.exercise.next.reason.rep_up.label')
          : t('live_workout.target.rep_up.body') + lastTime(reason.lastTime);
      }
      return short
        ? t('progress.exercise.next.reason.reps_up.label', { reps: reason.by })
        : t('live_workout.target.reps_up.body', { reps: reason.by }) + lastTime(reason.lastTime);
    case 'repeatAfterSuccess':
      return short
        ? t('progress.exercise.next.reason.repeat_success.label')
        : t('live_workout.target.repeat_success.body');
    case 'repeatAfterMiss':
      if (reason.reps === undefined) {
        return short
          ? t('progress.exercise.next.reason.repeat_skipped.label', { set: reason.setLabel })
          : t('live_workout.target.repeat_skipped.body', { set: reason.setLabel });
      }
      return short
        ? t('progress.exercise.next.reason.repeat_miss.label', {
            set: reason.setLabel,
            reps: reason.reps,
            target: reason.target,
          })
        : t('live_workout.target.repeat_miss.body', { set: reason.setLabel, reps: reason.reps, target: reason.target });
  }
}
