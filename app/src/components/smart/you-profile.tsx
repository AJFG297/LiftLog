import { ProfileCard } from '@/components/presentation/you/profile-card';
import { getFeedProfileEditorHref } from '@/components/smart/feed-profile-editor';
import { useFormatDate } from '@/hooks/useFormatDate';
import { useAppSelector } from '@/store';
import { useWorkoutQuery } from '@/hooks/useWorkoutQuery';
import { useTranslate } from '@tolgee/react';
import { useRouter } from 'expo-router';

/**
 * The You tab's profile. The name is the one set for the feed, the only name the app keeps, so the card
 * opens the feed's profile editor while the feed is on.
 */
export function YouProfile() {
  const { t } = useTranslate();
  const { push } = useRouter();
  const formatDate = useFormatDate();
  const showFeed = useAppSelector((x) => x.settings.showFeed);
  const feedName = useAppSelector((x) => x.feed.identity.unwrapOr(undefined)?.name);
  const profile = useWorkoutQuery(
    async (repository) => ({
      workoutCount: await repository.startedCount(),
      earliest: await repository.earliestDate(),
    }),
    [],
  );
  const workoutCount = profile?.workoutCount ?? 0;
  const earliest = profile?.earliest;

  const name = feedName?.trim() || t('you.profile.default_name');
  const since = earliest ? formatDate(earliest, { month: 'long', year: 'numeric' }) : undefined;
  // Blank for the moment the counts load, rather than a flash of "no workouts".
  const subtitle = !profile
    ? ''
    : workoutCount === 0 || !since
      ? t('you.profile.no_workouts.subtitle')
      : workoutCount === 1
        ? t('you.profile.workouts.one', { since })
        : t('you.profile.workouts.other', { count: workoutCount.toString(), since });

  return (
    <ProfileCard
      name={name}
      initial={feedName?.trim().charAt(0).toUpperCase() || undefined}
      subtitle={subtitle}
      onPress={showFeed ? () => push(getFeedProfileEditorHref()) : undefined}
    />
  );
}
