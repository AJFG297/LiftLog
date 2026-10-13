import { MsIconSrc } from '@/components/presentation/foundation/ms-icon-source';
import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { AmountText } from '@/components/presentation/stats/amount-text';
import { RecordRow } from '@/components/presentation/stats/record-row';
import { Sparkline } from '@/components/presentation/stats/sparkline';
import { ListCard, ListEmptyLine, useRowDivider, useToneColor } from '@/components/presentation/stats/list-parts';
import { ProgressSection } from '@/components/presentation/stats/progress/progress-section';
import { amountText, signedText } from '@/components/presentation/stats/amount-format';
import { spacing, useAppTheme } from '@/hooks/useAppTheme';
import { useFormatDate } from '@/hooks/useFormatDate';
import type { LiftRow } from '@/store/stats/progress-strength';
import type { RecordListRow } from '@/store/stats/records-list';
import { useTranslate } from '@tolgee/react';
import { Pressable, View } from 'react-native';

const SPARKLINE_WIDTH = 64;
const SPARKLINE_HEIGHT = 28;

interface StrengthSectionProps {
  lifts: readonly LiftRow[];
  records: readonly RecordListRow[];
  /** "kg" or "lbs". */
  unit: string;
  onOpenLift: (lift: LiftRow) => void;
  onOpenRecord: (record: RecordListRow) => void;
  onAllExercises: () => void;
  onAllRecords: () => void;
}

export function StrengthSection(props: StrengthSectionProps) {
  const { t } = useTranslate();
  return (
    <View style={{ gap: spacing[5] }}>
      <ProgressSection
        title={t('progress.tab.lifts.title')}
        subtitle={
          props.lifts.some((lift) => lift.pinned)
            ? t('progress.tab.lifts.pinned.subtitle')
            : t('progress.tab.lifts.subtitle')
        }
        action={{
          label: t('progress.tab.lifts.all_exercises.button'),
          onPress: props.onAllExercises,
          testID: 'progress-all-exercises',
        }}
      >
        <ListCard>
          {props.lifts.length ? (
            props.lifts.map((lift, index) => (
              <LiftRowView
                key={lift.key}
                lift={lift}
                index={index}
                unit={props.unit}
                onPress={() => props.onOpenLift(lift)}
              />
            ))
          ) : (
            <ListEmptyLine text={t('progress.tab.lifts.empty.body')} />
          )}
        </ListCard>
      </ProgressSection>

      <ProgressSection
        title={t('progress.tab.records.title')}
        action={{
          label: t('progress.tab.records.see_all.button'),
          onPress: props.onAllRecords,
          testID: 'progress-all-records',
        }}
      >
        <ListCard>
          {props.records.length ? (
            props.records.map((record, index) => (
              <RecentRecordRow
                key={record.key}
                record={record}
                index={index}
                unit={props.unit}
                onPress={() => props.onOpenRecord(record)}
              />
            ))
          ) : (
            <ListEmptyLine text={t('progress.tab.records.empty.body')} />
          )}
        </ListCard>
      </ProgressSection>
    </View>
  );
}

function LiftRowView({
  lift,
  index,
  unit,
  onPress,
}: {
  lift: LiftRow;
  index: number;
  unit: string;
  onPress: () => void;
}) {
  const { t } = useTranslate();
  const { tokens } = useAppTheme();
  const divider = useRowDivider();
  const toneColor = useToneColor();
  const isLoad = lift.axis === 'load';
  const subtitle = isLoad
    ? lift.sessions === 1
      ? t('progress.tab.lifts.one_rep_max.one')
      : t('progress.tab.lifts.one_rep_max.other', { count: lift.sessions })
    : lift.sessions === 1
      ? t('progress.tab.lifts.best_reps.one')
      : t('progress.tab.lifts.best_reps.other', { count: lift.sessions });
  const valueUnit = isLoad ? unit : t('progress.reps_unit.label');
  const value = lift.latest === undefined ? '–' : amountText(lift.latest);
  const change = lift.change === undefined ? undefined : signedText(lift.change);
  const changeSpoken = change && (change.text ? `${change.text} ${valueUnit}` : t('progress.same.label'));
  const changeStyle = {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
    color: change ? toneColor(change.tone) : tokens.muted,
  } as const;
  return (
    <Pressable
      testID={`progress-lift-${index}`}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={[
        lift.name,
        lift.pinned ? t('progress.tab.lifts.pinned.label') : undefined,
        subtitle,
        `${value} ${valueUnit}`,
        changeSpoken,
      ]
        .filter(Boolean)
        .join(', ')}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing[3],
          paddingVertical: 14,
          paddingLeft: spacing[4],
          paddingRight: 14,
          minHeight: 56,
        },
        divider(index),
        pressed && { backgroundColor: tokens.track },
      ]}
    >
      <View style={{ flex: 1, gap: spacing[0.5], minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[1] }}>
          <SurfaceText font="text-base" weight="600" numberOfLines={1} style={{ color: tokens.ink, flexShrink: 1 }}>
            {lift.name}
          </SurfaceText>
          {lift.pinned ? <MsIconSrc name="keepFill" size={14} color={tokens.muted} /> : null}
        </View>
        <SurfaceText numberOfLines={1} style={{ fontSize: 13, lineHeight: 18, color: tokens.muted }}>
          {subtitle}
        </SurfaceText>
      </View>
      <Sparkline values={lift.trend} width={SPARKLINE_WIDTH} height={SPARKLINE_HEIGHT} />
      <View style={{ minWidth: 66, alignItems: 'flex-end', gap: 1 }}>
        <AmountText
          amount={value}
          unit={valueUnit}
          style={{ fontSize: 18, lineHeight: 24, fontWeight: '600', color: tokens.ink, letterSpacing: -0.18 }}
          unitStyle={{ fontSize: 12, fontWeight: '500', color: tokens.muted }}
        />
        {change?.text ? (
          <AmountText amount={change.text} unit={valueUnit} style={changeStyle} />
        ) : change ? (
          <SurfaceText style={changeStyle}>{t('progress.same.label')}</SurfaceText>
        ) : null}
      </View>
      <MsIconSrc name="chevronRight" size={16} color={tokens.faint} />
    </Pressable>
  );
}

function RecentRecordRow({
  record,
  index,
  unit,
  onPress,
}: {
  record: RecordListRow;
  index: number;
  unit: string;
  onPress: () => void;
}) {
  const { t } = useTranslate();
  const formatDate = useFormatDate();
  const heaviest = record.kind === 'heaviestWeight';
  const kind = heaviest ? t('progress.tab.records.heaviest.label') : t('progress.tab.records.one_rep_max.label');
  const fullDate = formatDate(record.date, { weekday: 'long', month: 'long', day: 'numeric' });
  const lifted = heaviest ? { weight: record.value, reps: record.reps } : record.estimatedFrom;
  const set = `${amountText(lifted.weight.value)} ${unit} × ${lifted.reps}`;
  const estimate = heaviest ? undefined : `${amountText(record.value.value)} ${unit}`;
  const was = t('progress.was.label', { value: `${amountText(record.previous.value)} ${unit}` });
  return (
    <RecordRow
      testID={`progress-record-${index}`}
      row={record}
      index={index}
      shows="set"
      weekday={formatDate(record.date, { weekday: 'short' })}
      kindLabel={kind}
      accessibilityLabel={[fullDate, record.exerciseName, kind, estimate, set, was].filter(Boolean).join(', ')}
      onPress={onPress}
    />
  );
}
