import { Card } from '@/components/presentation/foundation/card';
import { RoundIconButton } from '@/components/presentation/foundation/round-icon-button';
import { SegmentedControl } from '@/components/presentation/foundation/segmented-control';
import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { HistoryRangeCard, RangeDay, RangeView } from '@/components/presentation/home/history-range-card';
import { HistoryRestRow, HistoryWorkoutCard } from '@/components/presentation/home/history-workout-card';
import { HomeHeader } from '@/components/presentation/home/home-header';
import { UpNextCard } from '@/components/presentation/home/up-next-card';
import { homeWorkoutHref } from '@/components/smart/home-workout-href';
import { WelcomeWizard } from '@/components/smart/welcome-wizard';
import { WhatsNewBanner } from '@/components/smart/whats-new-banner';
import { spacing, useAppTheme } from '@/hooks/useAppTheme';
import { useFormatDate } from '@/hooks/useFormatDate';
import { usePreferredWeightSuffix } from '@/hooks/usePreferredWeightUnit';
import { useStartWorkoutWithConfirmation } from '@/hooks/useStartWorkoutWithConfirmation';
import { useToday } from '@/hooks/useToday';
import {
  HistoryDay,
  HistoryRange,
  historyDaysOf,
  historyEntriesOf,
  historySummaryOf,
  thirtyDayGridOf,
  workoutFactsOf,
} from '@/models/home/history-range';
import { routineColorOf } from '@/models/home/routine-colors';
import { ProgramBlueprint } from '@/models/blueprint-models';
import { estimatedMinutesOf, lastDoneLabelOf, lastDoneOf, namePreviewOf } from '@/models/home/up-next';
import { Session } from '@/models/session-models';
import { Weight } from '@/models/weight';
import { useAppSelector, useAppSelectorWhenFocused, useAppSelectorWhenFocusedWithArg } from '@/store';
import { selectOwnSessionsByDate, selectStreakStats } from '@/store/activity';
import { publishUnpublishedSessions } from '@/store/feed';
import { fetchUpcomingSessions, selectActiveProgram } from '@/store/program';
import { executeRemoteBackup } from '@/store/settings';
import { selectActiveSessionId, selectHistoryPersonalRecords, selectSessions } from '@/store/stored-sessions';
import { LocalDate } from '@js-joda/core';
import { useTranslate } from '@tolgee/react';
import { useFocusEffect, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDispatch } from 'react-redux';

type TranslateFn = ReturnType<typeof useTranslate>['t'];

const UP_NEXT_EXERCISES_SHOWN = 2;
const CARD_EXERCISES_SHOWN = 3;

/**
 * The Home tab: what's next, and what was done in the last 7 or 30 days. The workout in progress isn't
 * here: it's the bar above the tab bar, which hides the Up next card while it shows.
 */
export function Home() {
  const { t } = useTranslate();
  const { tokens } = useAppTheme();
  const insets = useSafeAreaInsets();
  const dispatch = useDispatch();
  const { push, navigate } = useRouter();
  const formatDate = useFormatDate();
  const weightSuffix = usePreferredWeightSuffix();
  const useImperialUnits = useAppSelector((x) => x.settings.useImperialUnits);
  const locale = useAppSelector((x) => x.settings.preferredLanguage);
  const today = useToday();
  const [range, setRange] = useState<HistoryRange>(7);
  const { start, confirmationDialog } = useStartWorkoutWithConfirmation();

  // Home stays mounted under the workout screen, so it must not recompute these on every logged set.
  const hasWorkoutInProgress = useAppSelector((x) => selectActiveSessionId(x) !== undefined);
  const sessionsByDate = useAppSelectorWhenFocused(selectOwnSessionsByDate);
  const sessions = useAppSelectorWhenFocused(selectSessions);
  const personalRecords = useAppSelectorWhenFocused(selectHistoryPersonalRecords);
  const streakStats = useAppSelectorWhenFocusedWithArg(selectStreakStats, today);
  const upcoming = useAppSelector((x) => x.program.upcomingSessions);
  // Undefined while the plans load, or once the active plan has been deleted.
  const plan: ProgramBlueprint | undefined = useAppSelector(selectActiveProgram);

  useFocusEffect(() => {
    dispatch(fetchUpcomingSessions());
    dispatch(publishUnpublishedSessions());
    dispatch(executeRemoteBackup({}));
  });

  const planWorkoutNames = plan?.sessions.map((x) => x.name) ?? [];
  const colorOf = (session: Session) => routineColorOf(session.blueprint.name, planWorkoutNames);
  const nextSession = upcoming.map((x) => x.at(0)).unwrapOr(undefined);
  const bodyweight = nextSession?.bodyweight;

  const days = historyDaysOf(sessionsByDate, today, range);
  const summary = historySummaryOf(days);
  const entries = historyEntriesOf(days, range);

  const streakWeeks = streakStats.weeks + (streakStats.state === 'secured' ? 1 : 0);
  const streak =
    streakStats.state === 'none' || streakWeeks === 0
      ? undefined
      : streakWeeks === 1
        ? t('stats.streak.weeks.one')
        : t('stats.streak.weeks.other', { weeks: streakWeeks.toString() });

  const dayLabel = (day: HistoryDay): string => {
    const date = formatDate(day.date, { weekday: 'long', day: 'numeric', month: 'long' });
    const latest = day.sessions[0];
    return latest
      ? t('home.day.workout.label', { date, name: latest.blueprint.name })
      : t('home.day.none.label', { date });
  };
  const rangeDayOf = (day: HistoryDay): RangeDay => ({
    key: day.date.toString(),
    dayOfMonth: day.date.dayOfMonth(),
    color: day.sessions[0] ? colorOf(day.sessions[0]) : undefined,
    isToday: day.isToday,
    accessibilityLabel: dayLabel(day),
  });
  const weekdayLetter = (date: LocalDate) => formatDate(date, { weekday: 'narrow' });

  const view: RangeView =
    range === 7
      ? { kind: 'week', weekdays: days.map((day) => weekdayLetter(day.date)), days: days.map(rangeDayOf) }
      : {
          kind: 'month',
          weekdays: days.slice(-7).map((day) => weekdayLetter(day.date)),
          cells: thirtyDayGridOf(days).map((day) => (day ? rangeDayOf(day) : undefined)),
          legend: legendOf(days, colorOf),
        };

  const volume = volumeInUnit(summary.volumeKg, useImperialUnits);
  const historySubtitle = [
    summary.workouts === 1
      ? t('home.history.count.one')
      : t('home.history.count.other', { count: summary.workouts.toString() }),
    summary.averageMinutes === undefined
      ? undefined
      : t('home.history.average.label', { minutes: summary.averageMinutes.toString() }),
  ]
    .filter(Boolean)
    .join(' · ');

  const wholeNumber = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  const oneDecimal = new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const cardMeta = (session: Session) => {
    const facts = workoutFactsOf(session);
    return [
      facts.minutes === undefined ? undefined : t('home.history.meta.minutes', { minutes: facts.minutes.toString() }),
      `${wholeNumber.format(volumeInUnit(facts.volumeKg, useImperialUnits))} ${weightSuffix}`,
      facts.sets === 1
        ? t('home.history.meta.sets.one')
        : t('home.history.meta.sets.other', { count: facts.sets.toString() }),
    ]
      .filter(Boolean)
      .join(' · ');
  };

  const startFreeform = () => start(Session.freeformSession(LocalDate.now(), bodyweight));

  return (
    <ScrollView
      testID="home"
      style={{ flex: 1, backgroundColor: tokens.bg }}
      contentContainerStyle={{
        paddingTop: insets.top + spacing[4],
        paddingHorizontal: spacing.pageHorizontalMargin,
        paddingBottom: spacing[8],
        gap: spacing[5],
      }}
    >
      <HomeHeader
        date={formatDate(today, { weekday: 'long', month: 'short', day: 'numeric' })}
        title={t('home.title')}
        streak={streak}
      />
      <WelcomeWizard />
      <WhatsNewBanner />

      {hasWorkoutInProgress ? null : nextSession ? (
        <View style={{ gap: spacing[2] }}>
          <UpNextCard
            eyebrow={upNextEyebrow(t, plan, nextSession)}
            name={nextSession.blueprint.name}
            detail={upNextDetail(t, nextSession, sessions, today, formatDate)}
            color={colorOf(nextSession)}
            startLabel={t('home.up_next.start.button', { name: nextSession.blueprint.name })}
            otherLabel={t('home.up_next.other.button')}
            onStart={() => start(nextSession)}
            onOther={() => navigate('/routines')}
          />
          <FreeformButton label={t('workout.freeform.title')} onPress={startFreeform} />
        </View>
      ) : upcoming.isSuccess() ? (
        <Card testID="up-next-empty" style={{ borderRadius: 20, gap: spacing[3] }}>
          <View style={{ gap: spacing[1] }}>
            <SurfaceText font="text-lg" weight="700" style={{ color: tokens.ink }}>
              {t('plan.no_upcoming_workouts.title')}
            </SurfaceText>
            <SurfaceText font="text-sm" style={{ color: tokens.muted }}>
              {t('plan.no_upcoming_workouts.message')}
            </SurfaceText>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
            <RoundIconButton
              icon="assignment"
              label={t('home.up_next.choose.button')}
              accessibilityLabel={t('home.up_next.choose.button')}
              onPress={() => navigate('/routines')}
            />
            <FreeformButton label={t('workout.freeform.title')} onPress={startFreeform} />
          </View>
        </Card>
      ) : null}

      <SegmentedControl
        testID="home-range"
        accessibilityLabel={t('home.range.label')}
        value={range === 7 ? '7' : '30'}
        onChange={(value) => setRange(value === '7' ? 7 : 30)}
        options={[
          { value: '7', label: t('home.range.7.label') },
          { value: '30', label: t('home.range.30.label') },
        ]}
      />

      <HistoryRangeCard
        stats={[
          { label: t('home.summary.workouts.label'), value: summary.workouts.toString() },
          {
            label: t('home.summary.volume.label'),
            value: oneDecimal.format(volume / 1000),
            unit: useImperialUnits ? t('home.summary.kilo_pounds.unit') : t('home.summary.tonnes.unit'),
          },
          { label: t('home.summary.time.label'), value: durationText(t, summary.minutes) },
        ]}
        view={view}
      />

      <View style={{ gap: spacing[2] + 2 }}>
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            gap: spacing[3],
            paddingHorizontal: spacing[1],
          }}
        >
          <SurfaceText accessibilityRole="header" font="text-lg" weight="700" style={{ color: tokens.ink }}>
            {t('home.history.title')}
          </SurfaceText>
          <SurfaceText font="text-sm" numberOfLines={1} style={{ flexShrink: 1, color: tokens.muted }}>
            {historySubtitle}
          </SurfaceText>
        </View>
        {entries.map((entry) =>
          entry.kind === 'workout' ? (
            <HistoryWorkoutCard
              key={entry.session.id}
              weekday={formatDate(entry.date, { weekday: 'short' })}
              dayOfMonth={entry.date.dayOfMonth()}
              name={entry.session.blueprint.name}
              color={colorOf(entry.session)}
              prLabel={personalRecords.get(entry.session.id)?.length ? t('home.history.pr.label') : undefined}
              meta={cardMeta(entry.session)}
              exercises={namesText(t, workoutFactsOf(entry.session).exerciseNames, CARD_EXERCISES_SHOWN)}
              onPress={() => push(homeWorkoutHref(entry.session.id))}
            />
          ) : (
            <HistoryRestRow
              key={entry.date.toString()}
              day={formatDate(entry.date, { weekday: 'short', day: 'numeric' })}
              label={entry.isToday ? t('home.history.today.label') : t('home.history.rest_day.label')}
            />
          ),
        )}
        {summary.workouts === 0 ? (
          <SurfaceText font="text-sm" style={{ color: tokens.muted, paddingHorizontal: spacing[1] }}>
            {range === 7 ? t('home.history.empty_7.label') : t('home.history.empty_30.label')}
          </SurfaceText>
        ) : null}
        <RoundIconButton
          testID="home-all-history"
          icon="history"
          label={t('home.history.all.button')}
          accessibilityLabel={t('home.history.all.button')}
          onPress={() => push('/history')}
          style={{ alignSelf: 'flex-start' }}
        />
      </View>
      {confirmationDialog}
    </ScrollView>
  );
}

function FreeformButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <RoundIconButton
      testID="freeform-workout-button"
      icon="add"
      label={label}
      accessibilityLabel={label}
      onPress={onPress}
      style={{ alignSelf: 'flex-start' }}
    />
  );
}

function upNextEyebrow(t: TranslateFn, plan: ProgramBlueprint | undefined, session: Session) {
  const index = plan?.sessions.findIndex((x) => x.equals(session.blueprint)) ?? -1;
  if (!plan || index < 0) {
    return plan ? t('home.up_next.eyebrow_plan', { plan: plan.name }) : t('home.up_next.eyebrow');
  }
  return t('home.up_next.eyebrow_day', {
    plan: plan.name,
    day: (index + 1).toString(),
    total: plan.sessions.length.toString(),
  });
}

function upNextDetail(
  t: TranslateFn,
  session: Session,
  sessions: readonly Session[],
  today: LocalDate,
  formatDate: (date: LocalDate, opts: Intl.DateTimeFormatOptions) => string,
): string | undefined {
  const minutes = estimatedMinutesOf(session.blueprint, sessions);
  const lastDone = lastDoneOf(session.blueprint.name, sessions);
  const parts = [
    namesText(
      t,
      session.blueprint.exercises.map((x) => x.name),
      UP_NEXT_EXERCISES_SHOWN,
    ),
    minutes === undefined ? undefined : t('home.up_next.minutes.label', { minutes: minutes.toString() }),
    lastDone === undefined ? undefined : lastDoneText(t, lastDoneLabelOf(lastDone, today), formatDate),
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : undefined;
}

function lastDoneText(
  t: TranslateFn,
  label: ReturnType<typeof lastDoneLabelOf>,
  formatDate: (date: LocalDate, opts: Intl.DateTimeFormatOptions) => string,
): string {
  switch (label.kind) {
    case 'today':
      return t('home.up_next.last_done_today.label');
    case 'yesterday':
      return t('home.up_next.last_done_yesterday.label');
    case 'weekday':
      return t('home.up_next.last_done.label', { date: formatDate(label.date, { weekday: 'long' }) });
    case 'date':
      return t('home.up_next.last_done.label', { date: formatDate(label.date, { month: 'short', day: 'numeric' }) });
  }
}

/** "Bench Press, Overhead Press +3". */
function namesText(t: TranslateFn, names: readonly string[], shown: number): string {
  const preview = namePreviewOf(names, shown);
  const list = preview.names.join(', ');
  return preview.more ? t('home.names_more.label', { names: list, count: preview.more.toString() }) : list;
}

function durationText(t: TranslateFn, minutes: number): string {
  const hours = Math.floor(minutes / 60);
  return hours
    ? t('home.duration.hours_minutes', { hours: hours.toString(), minutes: (minutes % 60).toString().padStart(2, '0') })
    : t('home.duration.minutes', { minutes: minutes.toString() });
}

function volumeInUnit(kilograms: number, imperial: boolean): number {
  return imperial ? new Weight(kilograms, 'kilograms').convertTo('pounds').value.toNumber() : kilograms;
}

/** The routines that appear in the range, each once, in the order they were first done. */
function legendOf(days: readonly HistoryDay[], colorOf: (session: Session) => RangeDay['color']) {
  const legend = new Map<string, NonNullable<RangeDay['color']>>();
  for (const day of days) {
    for (const session of [...day.sessions].reverse()) {
      if (!legend.has(session.blueprint.name)) {
        legend.set(session.blueprint.name, colorOf(session)!);
      }
    }
  }
  return [...legend].map(([name, color]) => ({ name, color }));
}
