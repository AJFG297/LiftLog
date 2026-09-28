import { AppIconName } from '@/components/presentation/foundation/ms-icon-source';
import { formatTimeSpan } from '@/utils/format-time-span';
import { getChangeDescription, getChangeLabelKey } from '@/models/blueprint-diff';
import { RoutineChange } from '@/models/routine-update';
import { UseTranslateResult } from '@tolgee/react';
import { match } from 'ts-pattern';

export interface RoutineChangeCopy {
  icon: AppIconName;
  title: string;
  subtitle: string;
}

/** What a row of the update-routine sheet says about `change`. */
export function routineChangeCopy(t: UseTranslateResult['t'], change: RoutineChange): RoutineChangeCopy {
  return match(change)
    .returnType<RoutineChangeCopy>()
    .with({ kind: 'added' }, (c) => ({
      icon: 'add',
      title: t('finish.update_routine.added.title', { name: c.exerciseName }),
      subtitle: c.after
        ? t('finish.update_routine.added_after.subtitle', { sets: setCount(t, c.sets), previous: c.after })
        : t('finish.update_routine.added_first.subtitle', { sets: setCount(t, c.sets) }),
    }))
    .with({ kind: 'removed' }, (c) => ({
      icon: 'remove',
      title: t('finish.update_routine.removed.title', { name: c.exerciseName }),
      subtitle: t('finish.update_routine.removed.subtitle'),
    }))
    .with({ kind: 'order' }, (c) => ({
      icon: 'unfoldMore',
      title: t('finish.update_routine.order.title'),
      subtitle: c.order.join(' · '),
    }))
    .with({ kind: 'setCount' }, (c) => {
      const moved = Math.abs(c.to - c.from);
      const subtitleKey =
        c.to > c.from
          ? moved === 1
            ? 'finish.update_routine.set_added_one.subtitle'
            : 'finish.update_routine.set_added_many.subtitle'
          : moved === 1
            ? 'finish.update_routine.set_removed_one.subtitle'
            : 'finish.update_routine.set_removed_many.subtitle';
      return {
        icon: 'fitnessCenter',
        title:
          c.to === 1
            ? t('finish.update_routine.set_count_one.title', { name: c.exerciseName, from: c.from })
            : t('finish.update_routine.set_count.title', { name: c.exerciseName, from: c.from, to: c.to }),
        subtitle: t(subtitleKey, { count: moved }),
      };
    })
    .with({ kind: 'setTypes' }, (c) => ({
      icon: 'bolt',
      title: t('finish.update_routine.set_types.title', { name: c.exerciseName }),
      subtitle: t('plan.diff.generic_two_value_change.body', { oldValue: c.from.join(' '), newValue: c.to.join(' ') }),
    }))
    .with({ kind: 'warmups' }, (c) => ({
      icon: 'localFireDepartment',
      title: t('finish.update_routine.warmups.title', { name: c.exerciseName, from: c.from, to: c.to }),
      subtitle: t('finish.update_routine.changed_today.subtitle'),
    }))
    .with({ kind: 'rest' }, (c) => ({
      icon: 'timer',
      title: c.from.equals(c.to)
        ? t('finish.update_routine.rest_advanced.title', { name: c.exerciseName })
        : t('finish.update_routine.rest.title', {
            name: c.exerciseName,
            from: formatTimeSpan(c.from),
            to: formatTimeSpan(c.to),
          }),
      subtitle: t('finish.update_routine.changed_today.subtitle'),
    }))
    .with({ kind: 'superset' }, (c) => ({
      icon: 'link',
      title: c.grouped
        ? c.with
          ? t('finish.update_routine.superset_with.title', { name: c.exerciseName, other: c.with })
          : t('finish.update_routine.superset.title', { name: c.exerciseName })
        : c.with
          ? t('finish.update_routine.unsuperset_with.title', { name: c.exerciseName, other: c.with })
          : t('finish.update_routine.unsuperset.title', { name: c.exerciseName }),
      subtitle: t('finish.update_routine.changed_today.subtitle'),
    }))
    .with({ kind: 'other' }, (c) => {
      const label = getChangeLabelKey(c.change);
      const labelText = t(label.key, label.params);
      const exerciseName = 'exerciseName' in c.change ? c.change.exerciseName : undefined;
      return {
        icon: 'edit',
        title: exerciseName
          ? t('finish.update_routine.exercise_field.title', { name: exerciseName, field: labelText })
          : labelText,
        subtitle: getChangeDescription(t, c.change),
      };
    })
    .exhaustive();
}

function setCount(t: UseTranslateResult['t'], sets: number): string {
  return sets === 1
    ? t('finish.update_routine.sets_one.label')
    : t('finish.update_routine.sets_many.label', { count: sets });
}
