import { formatWeightText } from '@/components/presentation/foundation/weight-format';
import { formatRepsTarget } from '@/models/blueprint-models';
import { LastTime, TargetReason, TodaysTarget } from '@/models/session-models/todays-target';
import { useTranslate } from '@tolgee/react';

type TranslateFn = ReturnType<typeof useTranslate>['t'];

/** "87.5 kg × 5", "BW +10 kg × 8-12", or "12 reps" for a movement with no load. */
export function targetLabel(t: TranslateFn, target: TodaysTarget, usesBodyweight: boolean): string {
  const reps = formatRepsTarget(target.reps);
  if (!target.weight) {
    return t('live_workout.target.reps_only.label', { reps });
  }
  return `${formatWeightText(target.weight, usesBodyweight, t('exercise.short_bodyweight.label'))} × ${reps}`;
}

/** The sentence under "Today:" saying why the target is what it is. */
export function targetReasonText(t: TranslateFn, reason: TargetReason): string {
  const lastTime = (summary: LastTime | undefined) =>
    summary ? ` ${t('live_workout.target.last_time.body', { sets: summary.sets, reps: summary.reps })}` : '';
  switch (reason.kind) {
    case 'firstTime':
      return t('live_workout.target.first_time.body');
    case 'newScheme':
      return t('live_workout.target.new_scheme.body');
    case 'weightUp':
      return (
        t('live_workout.target.weight_up.body', { weight: formatWeightText(reason.by) }) + lastTime(reason.lastTime)
      );
    case 'weightDown':
      return t('live_workout.target.weight_down.body', { weight: formatWeightText(reason.by) });
    case 'repsUp':
      return (
        (reason.by === 1
          ? t('live_workout.target.rep_up.body')
          : t('live_workout.target.reps_up.body', { reps: reason.by })) + lastTime(reason.lastTime)
      );
    case 'repeatAfterSuccess':
      return t('live_workout.target.repeat_success.body');
    case 'repeatAfterMiss':
      return reason.reps === undefined
        ? t('live_workout.target.repeat_skipped.body', { set: reason.setLabel })
        : t('live_workout.target.repeat_miss.body', { set: reason.setLabel, reps: reason.reps, target: reason.target });
  }
}
