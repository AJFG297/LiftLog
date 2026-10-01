import { estimatedMinutesOf, lastDoneLabelOf, lastDoneOf, namePreviewOf } from '@/models/home/up-next';
import { Session } from '@/models/session-models';
import { LocalDate } from '@js-joda/core';
import { useTranslate } from '@tolgee/react';

type TranslateFn = ReturnType<typeof useTranslate>['t'];
type FormatDate = (date: LocalDate, opts: Intl.DateTimeFormatOptions) => string;

const UP_NEXT_EXERCISES_SHOWN = 2;

/** "Bench Press, Overhead Press +3 · ~50 min · last done Wednesday", for a plan workout not started yet. */
export function upNextDetailText(
  t: TranslateFn,
  session: Session,
  sessions: readonly Session[],
  today: LocalDate,
  formatDate: FormatDate,
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

/** "Bench Press, Overhead Press +3". */
export function namesText(t: TranslateFn, names: readonly string[], shown: number): string {
  const preview = namePreviewOf(names, shown);
  const list = preview.names.join(', ');
  return preview.more ? t('home.names_more.label', { names: list, count: preview.more.toString() }) : list;
}

function lastDoneText(t: TranslateFn, label: ReturnType<typeof lastDoneLabelOf>, formatDate: FormatDate): string {
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
