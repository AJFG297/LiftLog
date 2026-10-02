import { MsIconSrc } from '@/components/presentation/foundation/ms-icon-source';
import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { Sparkline } from '@/components/presentation/stats/sparkline';
import {
  ProgressEmptyLine,
  ProgressListCard,
  ProgressSection,
  useRowDivider,
  useToneColor,
} from '@/components/presentation/stats/progress/progress-section';
import { formatAmount, signedAmount } from '@/components/presentation/stats/progress/progress-format';
import { fontFamily, spacing, useAppTheme } from '@/hooks/useAppTheme';
import { useFormatDate } from '@/hooks/useFormatDate';
import type { LiftRow, RecentRecord } from '@/store/stats/progress-strength';
import { useTranslate } from '@tolgee/react';
import { Pressable, Text, View } from 'react-native';

const SPARKLINE_WIDTH = 64;
const SPARKLINE_HEIGHT = 28;
/** An estimated 1RM is a calculation, so a tenth is as fine as it gets. */
const ONE_REP_MAX_DECIMALS = 1;

interface StrengthSectionProps {
  lifts: readonly LiftRow[];
  records: readonly RecentRecord[];
  /** "kg" or "lbs". */
  unit: string;
  onOpenLift: (lift: LiftRow) => void;
  onOpenRecord: (record: RecentRecord) => void;
  onAllExercises: () => void;
  onAllRecords: () => void;
}

export function StrengthSection(props: StrengthSectionProps) {
  const { t } = useTranslate();
  return (
    <View style={{ gap: spacing[5] }}>
      <ProgressSection
        title={t('progress.tab.lifts.title')}
        subtitle={t('progress.tab.lifts.subtitle')}
        action={{
          label: t('progress.tab.lifts.all_exercises.button'),
          onPress: props.onAllExercises,
          testID: 'progress-all-exercises',
        }}
      >
        <ProgressListCard>
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
            <ProgressEmptyLine text={t('progress.tab.lifts.empty.body')} />
          )}
        </ProgressListCard>
      </ProgressSection>

      <ProgressSection
        title={t('progress.tab.records.title')}
        action={{
          label: t('progress.tab.records.see_all.button'),
          onPress: props.onAllRecords,
          testID: 'progress-all-records',
        }}
      >
        <ProgressListCard>
          {props.records.length ? (
            props.records.map((record, index) => (
              <RecordRowView
                key={`${record.workoutId}-${record.key}`}
                record={record}
                index={index}
                unit={props.unit}
                onPress={() => props.onOpenRecord(record)}
              />
            ))
          ) : (
            <ProgressEmptyLine text={t('progress.tab.records.empty.body')} />
          )}
        </ProgressListCard>
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
  const valueUnit = isLoad ? unit : t('progress.tab.lifts.reps.label');
  const value = lift.latest === undefined ? '–' : formatAmount(lift.latest, isLoad ? ONE_REP_MAX_DECIMALS : 0);
  const change = lift.change === undefined ? undefined : signedAmount(lift.change, isLoad ? ONE_REP_MAX_DECIMALS : 0);
  const changeText = change && (change.text ?? t('progress.tab.same.label'));
  const changeSpoken = change && (change.text ? `${change.text} ${valueUnit}` : changeText);
  return (
    <Pressable
      testID={`progress-lift-${index}`}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={[lift.name, subtitle, `${value} ${valueUnit}`, changeSpoken].filter(Boolean).join(', ')}
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
        <SurfaceText font="text-base" weight="600" numberOfLines={1} style={{ color: tokens.ink }}>
          {lift.name}
        </SurfaceText>
        <SurfaceText numberOfLines={1} style={{ fontSize: 13, lineHeight: 18, color: tokens.muted }}>
          {subtitle}
        </SurfaceText>
      </View>
      <Sparkline values={lift.trend} width={SPARKLINE_WIDTH} height={SPARKLINE_HEIGHT} />
      <View style={{ minWidth: 66, alignItems: 'flex-end', gap: 1 }}>
        <Text
          style={{
            fontFamily: fontFamily.number,
            fontSize: 18,
            lineHeight: 24,
            fontWeight: '600',
            color: tokens.ink,
            letterSpacing: -0.18,
          }}
        >
          {value}
          <Text style={{ fontFamily: fontFamily.text, fontSize: 12, fontWeight: '500', color: tokens.muted }}>
            {` ${valueUnit}`}
          </Text>
        </Text>
        {change ? (
          <Text
            style={{
              fontFamily: fontFamily.number,
              fontSize: 12,
              lineHeight: 16,
              fontWeight: '600',
              color: toneColor(change.tone),
            }}
          >
            {changeText}
            {change.text ? <Text style={{ fontFamily: fontFamily.text }}>{` ${valueUnit}`}</Text> : null}
          </Text>
        ) : null}
      </View>
      <MsIconSrc name="chevronRight" size={16} color={tokens.faint} />
    </Pressable>
  );
}

function RecordRowView({
  record,
  index,
  unit,
  onPress,
}: {
  record: RecentRecord;
  index: number;
  unit: string;
  onPress: () => void;
}) {
  const { t } = useTranslate();
  const { tokens } = useAppTheme();
  const formatDate = useFormatDate();
  const divider = useRowDivider();
  const heaviest = record.kind === 'heaviestWeight';
  const decimals = heaviest ? 2 : ONE_REP_MAX_DECIMALS;
  const kind = heaviest ? t('progress.tab.records.heaviest.label') : t('progress.tab.records.one_rep_max.label');
  const value = formatAmount(record.value, decimals);
  const gain = signedAmount(record.gain, decimals);
  const weekday = formatDate(record.date, { weekday: 'short' });
  const fullDate = formatDate(record.date, { weekday: 'long', month: 'long', day: 'numeric' });
  const weight = formatAmount(record.weight, 2);
  const set = `${weight} ${unit} × ${record.reps}`;
  const estimate = heaviest ? undefined : `${value} ${unit}`;
  const was = t('progress.tab.records.was.label', { value: `${formatAmount(record.previous, decimals)} ${unit}` });
  const mono = { fontFamily: fontFamily.number, color: tokens.ink };
  return (
    <Pressable
      testID={`progress-record-${index}`}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={[fullDate, record.name, kind, estimate, set, was].filter(Boolean).join(', ')}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 14,
          paddingVertical: spacing[3],
          paddingHorizontal: 14,
          minHeight: 56,
        },
        divider(index),
        pressed && { backgroundColor: tokens.track },
      ]}
    >
      <View style={{ width: 40, alignItems: 'center' }}>
        <SurfaceText
          weight="600"
          style={{ fontSize: 11, lineHeight: 14, color: tokens.muted, letterSpacing: 0.66, textTransform: 'uppercase' }}
        >
          {weekday}
        </SurfaceText>
        <SurfaceText numeric weight="600" font="text-xl" style={{ color: tokens.ink }}>
          {record.date.dayOfMonth()}
        </SurfaceText>
      </View>
      <View style={{ flex: 1, gap: spacing[0.5], minWidth: 0 }}>
        <SurfaceText weight="600" numberOfLines={1} style={{ fontSize: 15, lineHeight: 20, color: tokens.ink }}>
          {record.name}
        </SurfaceText>
        <SurfaceText numberOfLines={1} style={{ fontSize: 13, lineHeight: 18, color: tokens.muted }}>
          {`${kind} · `}
          <Text style={mono}>{weight}</Text>
          <Text style={{ color: tokens.ink }}>{` ${unit} × `}</Text>
          <Text style={mono}>{record.reps}</Text>
        </SurfaceText>
      </View>
      {gain.text ? (
        <View style={{ backgroundColor: tokens.accentSoft, borderRadius: 7, paddingVertical: 3, paddingHorizontal: 7 }}>
          <Text
            style={{
              fontFamily: fontFamily.number,
              fontSize: 12,
              lineHeight: 16,
              fontWeight: '600',
              color: tokens.accentSoftInk,
            }}
          >
            {gain.text}
            <Text style={{ fontFamily: fontFamily.text, fontWeight: '700' }}>{` ${unit}`}</Text>
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}
