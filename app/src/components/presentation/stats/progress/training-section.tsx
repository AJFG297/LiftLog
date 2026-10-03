import { Card } from '@/components/presentation/foundation/card';
import { MsIconSrc } from '@/components/presentation/foundation/ms-icon-source';
import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import {
  formatAmount,
  formatFixed,
  formatHalves,
  signedAmount,
  SignedText,
  toHalf,
} from '@/components/presentation/stats/amount-format';
import { ListEmptyLine, useToneColor } from '@/components/presentation/stats/list-parts';
import { ProgressSection } from '@/components/presentation/stats/progress/progress-section';
import { spacing, useAppTheme } from '@/hooks/useAppTheme';
import { useFormatDate } from '@/hooks/useFormatDate';
import { RUN_WORKOUTS, type MuscleKey, type TrainingView, type WeeklyAverage } from '@/store/stats/progress-training';
import { useTranslate } from '@tolgee/react';
import { View } from 'react-native';

const BARS_HEIGHT = 48;
const BAR_MAX_HEIGHT = 46;
const EMPTY_BAR_HEIGHT = 3;
/** A full bar is this many workouts, or the busiest week if it had more. */
const BAR_FULL_WORKOUTS = 4;
/** Past this many bars they're drawn thinner and closer. */
const DENSE_BARS = 20;
/** Sets per muscle draws a bar to this many sets a week. */
const MUSCLE_SCALE_SETS = 24;
/** The band for a common growth range, in sets a week. */
const BAND_FROM = 10;
const BAND_TO = 20;

interface TrainingSectionProps {
  view: TrainingView;
  /** The muscle's name as shown. */
  muscleLabel: (muscle: MuscleKey) => string;
}

export function TrainingSection({ view, muscleLabel }: TrainingSectionProps) {
  const { t } = useTranslate();
  return (
    <View style={{ gap: spacing[4] }}>
      <WeeklyCard view={view} />
      <ProgressSection title={t('progress.tab.muscles.title')} subtitle={t('progress.tab.muscles.subtitle')}>
        <MusclesCard view={view} muscleLabel={muscleLabel} />
      </ProgressSection>
    </View>
  );
}

function WeeklyCard({ view }: { view: TrainingView }) {
  const { t } = useTranslate();
  const { tokens } = useAppTheme();
  const formatDate = useFormatDate();
  const firstBar = view.bars[0];
  const dense = view.bars.length > DENSE_BARS;
  const full = Math.max(BAR_FULL_WORKOUTS, ...view.bars.map((bar) => bar.workouts));
  const startLabel = firstBar ? formatDate(firstBar.start, { month: 'short', day: 'numeric' }) : '';
  const runLabel = t('progress.tab.training.run.label', { count: RUN_WORKOUTS });
  const runWeeks =
    view.longestRun === 1
      ? t('progress.tab.training.run_weeks.one')
      : t('progress.tab.training.run_weeks.other', { count: view.longestRun });
  return (
    <Card style={{ gap: 14 }}>
      <View style={{ flexDirection: 'row', gap: spacing[3] }}>
        <WeeklyStat
          label={t('progress.tab.training.workouts_per_week.label')}
          stat={view.workoutsPerWeek}
          format={(value) => formatFixed(value, 1)}
          change={(value) => signedAmount(value, 1, { fixed: true })}
        />
        <WeeklyStat
          label={t('progress.tab.training.sets_per_week.label')}
          stat={view.setsPerWeek}
          format={(value) => formatAmount(value, 0)}
          change={(value) => signedAmount(value, 0)}
        />
      </View>
      {view.averagedWeeks ? null : (
        <SurfaceText style={{ fontSize: 13, lineHeight: 18, color: tokens.muted }}>
          {t('progress.tab.training.first_week.body')}
        </SurfaceText>
      )}
      <View style={{ gap: 6 }}>
        <View
          accessible
          accessibilityRole="image"
          accessibilityLabel={t('progress.tab.training.bars.spoken', {
            date: startLabel,
            counts: view.bars.map((bar) => bar.workouts).join(', '),
          })}
          style={{ height: BARS_HEIGHT, flexDirection: 'row', alignItems: 'flex-end', gap: dense ? 2 : 6 }}
        >
          {view.bars.map((bar) => (
            <View
              key={bar.start.toString()}
              style={{
                flex: 1,
                height: bar.workouts ? Math.round((bar.workouts / full) * BAR_MAX_HEIGHT) : EMPTY_BAR_HEIGHT,
                borderRadius: dense ? 2 : 4,
                backgroundColor: bar.isThisWeek ? tokens.accentLine2 : bar.workouts ? tokens.accent : tokens.line2,
              }}
            />
          ))}
        </View>
        <View
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
          style={{ flexDirection: 'row', justifyContent: 'space-between' }}
        >
          <BarCaption text={startLabel} />
          <BarCaption text={t('progress.tab.training.bars.label')} />
          <BarCaption text={t('progress.tab.training.this_week.label')} />
        </View>
      </View>
      <View style={{ height: 1, backgroundColor: tokens.line }} />
      <View
        accessible
        accessibilityLabel={`${runLabel}, ${runWeeks}`}
        style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}
      >
        <MsIconSrc name="localFireDepartment" size={16} color={tokens.accentInk} />
        <SurfaceText style={{ flex: 1, fontSize: 13, lineHeight: 18, color: tokens.muted }}>{runLabel}</SurfaceText>
        <SurfaceText weight="600" style={{ fontSize: 13, lineHeight: 18, color: tokens.ink }}>
          {runWeeks}
        </SurfaceText>
      </View>
    </Card>
  );
}

function WeeklyStat({
  label,
  stat,
  format,
  change,
}: {
  label: string;
  stat: WeeklyAverage;
  format: (value: number) => string;
  change: (value: number) => SignedText;
}) {
  const { t } = useTranslate();
  const { tokens } = useAppTheme();
  const toneColor = useToneColor();
  const moved = stat.change === undefined ? undefined : change(stat.change);
  return (
    <View style={{ flex: 1, gap: spacing[0.5] }}>
      <SurfaceText font="text-xs" weight="500" style={{ color: tokens.muted }}>
        {label}
      </SurfaceText>
      <SurfaceText
        numeric
        weight="600"
        style={{ fontSize: 28, lineHeight: 34, letterSpacing: -0.56, color: tokens.ink }}
      >
        {stat.average === undefined ? '–' : format(stat.average)}
      </SurfaceText>
      {moved ? (
        <SurfaceText
          numeric={!!moved.text}
          weight="600"
          style={{ fontSize: 13, lineHeight: 18, color: toneColor(moved.tone) }}
        >
          {moved.text ?? t('progress.same.label')}
        </SurfaceText>
      ) : null}
    </View>
  );
}

function BarCaption({ text }: { text: string }) {
  const { tokens } = useAppTheme();
  return (
    <SurfaceText weight="500" style={{ fontSize: 11, lineHeight: 14, color: tokens.muted }}>
      {text}
    </SurfaceText>
  );
}

function MusclesCard({ view, muscleLabel }: TrainingSectionProps) {
  const { t } = useTranslate();
  const { tokens } = useAppTheme();
  const percent = (sets: number) => `${(Math.min(sets, MUSCLE_SCALE_SETS) / MUSCLE_SCALE_SETS) * 100}%` as const;
  return (
    <Card style={{ gap: 11 }}>
      {view.muscles.length ? (
        view.muscles.map(({ muscle, setsPerWeek }) => {
          const shown = toHalf(setsPerWeek);
          const label = muscleLabel(muscle);
          return (
            <View
              key={muscle}
              accessible
              accessibilityLabel={t('progress.tab.muscles.row.spoken', {
                muscle: label,
                sets: formatHalves(setsPerWeek),
              })}
              style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}
            >
              <SurfaceText font="text-sm" weight="500" numberOfLines={1} style={{ width: 88, color: tokens.ink }}>
                {label}
              </SurfaceText>
              <View style={{ flex: 1, height: 10, borderRadius: 5, backgroundColor: tokens.track, overflow: 'hidden' }}>
                <View
                  style={{
                    position: 'absolute',
                    top: 0,
                    bottom: 0,
                    left: percent(BAND_FROM),
                    width: percent(BAND_TO - BAND_FROM),
                    backgroundColor: tokens.line2,
                  }}
                />
                <View
                  style={{
                    position: 'absolute',
                    top: 0,
                    bottom: 0,
                    left: 0,
                    width: percent(shown),
                    borderRadius: 5,
                    backgroundColor: shown < BAND_FROM ? tokens.accentLine2 : tokens.accent,
                  }}
                />
              </View>
              <SurfaceText
                numeric
                font="text-sm"
                weight="600"
                style={{ minWidth: 30, textAlign: 'right', color: tokens.ink }}
              >
                {formatHalves(setsPerWeek)}
              </SurfaceText>
            </View>
          );
        })
      ) : (
        <ListEmptyLine
          text={t(view.averagedWeeks ? 'progress.tab.muscles.empty.body' : 'progress.tab.muscles.first_week.body')}
          inset={false}
        />
      )}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2], paddingTop: spacing[0.5] }}>
        <View style={{ width: 18, height: 8, borderRadius: 4, backgroundColor: tokens.line2 }} />
        <SurfaceText font="text-xs" style={{ flexShrink: 1, color: tokens.muted }}>
          {t('progress.tab.muscles.band.label')}
        </SurfaceText>
      </View>
      <SurfaceText font="text-xs" style={{ color: tokens.muted, lineHeight: 17 }}>
        {t('progress.tab.muscles.counting.body')}
      </SurfaceText>
    </Card>
  );
}
