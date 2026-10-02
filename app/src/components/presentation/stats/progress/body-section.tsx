import { Card } from '@/components/presentation/foundation/card';
import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { AmountText } from '@/components/presentation/stats/amount-text';
import { bodyChartGeometry } from '@/components/presentation/stats/progress/body-chart-geometry';
import { formatFixed, signedAmount } from '@/components/presentation/stats/amount-format';
import { ListCard, useRowDivider } from '@/components/presentation/stats/list-parts';
import { ProgressSection } from '@/components/presentation/stats/progress/progress-section';
import { fontFamily, spacing, useAppTheme } from '@/hooks/useAppTheme';
import { useFormatDate } from '@/hooks/useFormatDate';
import type { BodyView } from '@/store/stats/progress-body';
import { LocalDate } from '@js-joda/core';
import { useTranslate } from '@tolgee/react';
import { useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';

const CHART_HEIGHT = 150;
/** Bodyweight is entered to a tenth. */
const DECIMALS = 1;

interface BodySectionProps {
  view: BodyView;
  /** The range's first day and today, the chart's ends. */
  from: LocalDate;
  to: LocalDate;
  /** "kg" or "lbs". */
  unit: string;
  /** "over 12 weeks". */
  overRange: string;
}

export function BodySection({ view, from, to, unit, overRange }: BodySectionProps) {
  const { t } = useTranslate();
  const { tokens } = useAppTheme();
  const formatDate = useFormatDate();
  const divider = useRowDivider();
  const change = view.change === undefined ? undefined : signedAmount(view.change, DECIMALS, { fixed: true });
  const changeStyle = { fontSize: 15, lineHeight: 20, fontWeight: '600', color: tokens.ink } as const;
  const longDate = (date: LocalDate) => formatDate(date, { weekday: 'short', month: 'short', day: 'numeric' });
  return (
    <View style={{ gap: spacing[4] }}>
      <Card style={{ gap: spacing[3] }}>
        <View
          style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing[3] }}
        >
          <View style={{ flexShrink: 1, gap: spacing[0.5] }}>
            <SurfaceText font="text-xs" weight="500" style={{ color: tokens.muted }}>
              {t('progress.tab.body.bodyweight.label')}
            </SurfaceText>
            <AmountText
              testID="progress-bodyweight"
              amount={formatFixed(view.current, DECIMALS)}
              unit={unit}
              style={{ fontSize: 34, lineHeight: 40, fontWeight: '600', letterSpacing: -0.68, color: tokens.ink }}
              unitStyle={{ fontSize: 15, fontWeight: '500', color: tokens.muted }}
            />
            <SurfaceText style={{ fontSize: 13, lineHeight: 18, color: tokens.muted }}>
              {t('progress.tab.body.last_weighed.label', { date: longDate(view.lastWeighed) })}
            </SurfaceText>
          </View>
          {change ? (
            <View style={{ alignItems: 'flex-end', gap: spacing[0.5], paddingTop: spacing[0.5] }}>
              {change.text ? (
                <AmountText amount={change.text} unit={unit} style={changeStyle} />
              ) : (
                <SurfaceText style={changeStyle}>{t('progress.tab.same.label')}</SurfaceText>
              )}
              <SurfaceText font="text-xs" style={{ color: tokens.muted }}>
                {overRange}
              </SurfaceText>
            </View>
          ) : null}
        </View>
        <BodyChart view={view} from={from} to={to} unit={unit} />
        <View style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: tokens.line, paddingTop: spacing[3] }}>
          <BodyStat label={t('progress.tab.body.lowest.label')} value={view.lowest} align="flex-start" />
          <BodyStat label={t('progress.tab.body.average.label')} value={view.average} align="center" />
          <BodyStat label={t('progress.tab.body.highest.label')} value={view.highest} align="flex-end" />
        </View>
      </Card>

      <ProgressSection title={t('progress.tab.weigh_ins.title')} subtitle={t('progress.tab.weigh_ins.subtitle')}>
        <ListCard>
          {view.recent.map((weighIn, index) => {
            const moved =
              weighIn.change === undefined ? undefined : signedAmount(weighIn.change, DECIMALS, { fixed: true });
            return (
              <View
                key={weighIn.workoutId}
                accessible
                accessibilityLabel={[
                  longDate(weighIn.date),
                  `${formatFixed(weighIn.weight, DECIMALS)} ${unit}`,
                  moved?.text,
                ]
                  .filter(Boolean)
                  .join(', ')}
                style={[
                  {
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 14,
                    paddingVertical: spacing[3],
                    paddingHorizontal: spacing[4],
                  },
                  divider(index),
                ]}
              >
                <SurfaceText
                  weight="500"
                  numberOfLines={1}
                  style={{ flex: 1, fontSize: 15, lineHeight: 20, color: tokens.ink }}
                >
                  {longDate(weighIn.date)}
                </SurfaceText>
                {moved?.text ? (
                  <SurfaceText numeric style={{ fontSize: 13, lineHeight: 18, color: tokens.muted }}>
                    {moved.text}
                  </SurfaceText>
                ) : null}
                <AmountText
                  amount={formatFixed(weighIn.weight, DECIMALS)}
                  unit={unit}
                  style={{
                    minWidth: 72,
                    textAlign: 'right',
                    fontSize: 16,
                    lineHeight: 22,
                    fontWeight: '600',
                    color: tokens.ink,
                  }}
                  unitStyle={{ fontSize: 12, fontWeight: '500', color: tokens.muted }}
                />
              </View>
            );
          })}
        </ListCard>
      </ProgressSection>
    </View>
  );
}

function BodyStat({
  label,
  value,
  align,
}: {
  label: string;
  value: number;
  align: 'flex-start' | 'center' | 'flex-end';
}) {
  const { tokens } = useAppTheme();
  return (
    <View style={{ flex: 1, alignItems: align, gap: spacing[0.5] }}>
      <SurfaceText font="text-xs" style={{ color: tokens.muted }}>
        {label}
      </SurfaceText>
      <SurfaceText numeric weight="600" font="text-base" style={{ color: tokens.ink }}>
        {formatFixed(value, DECIMALS)}
      </SurfaceText>
    </View>
  );
}

function BodyChart({ view, from, to, unit }: { view: BodyView; from: LocalDate; to: LocalDate; unit: string }) {
  const { t } = useTranslate();
  const { tokens } = useAppTheme();
  const formatDate = useFormatDate();
  const [width, setWidth] = useState(0);
  const geometry = width ? bodyChartGeometry(view.chart, from, to, width, CHART_HEIGHT) : undefined;
  const first = view.chart[0];
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={
        first
          ? t('progress.tab.body.chart.spoken', {
              from: `${formatFixed(first.weight, DECIMALS)} ${unit}`,
              to: `${formatFixed(view.current, DECIMALS)} ${unit}`,
            })
          : undefined
      }
      onLayout={(event) => setWidth(Math.round(event.nativeEvent.layout.width))}
      style={{ height: CHART_HEIGHT }}
    >
      {geometry ? (
        <Svg width={width} height={CHART_HEIGHT}>
          {geometry.grid.map((line) => (
            <Line
              key={line.value}
              x1={0}
              x2={geometry.right + 6}
              y1={line.y}
              y2={line.y}
              stroke={tokens.line}
              strokeWidth={1}
            />
          ))}
          {geometry.grid.map((line) => (
            <SvgText
              key={`label-${line.value}`}
              x={width}
              y={line.y + 4}
              textAnchor="end"
              fontFamily={fontFamily.number}
              fontSize={11}
              fontWeight="500"
              fill={tokens.muted}
            >
              {formatFixed(line.value, geometry.gridDecimals)}
            </SvgText>
          ))}
          <Path
            d={geometry.path}
            stroke={tokens.ink}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          {geometry.dots.map((dot) => (
            <Circle
              key={`${dot.x}-${dot.y}`}
              cx={dot.x}
              cy={dot.y}
              r={2.4}
              fill={tokens.card}
              stroke={tokens.ink}
              strokeWidth={1.5}
            />
          ))}
          <Circle
            cx={geometry.end.x}
            cy={geometry.end.y}
            r={5}
            fill={tokens.ink}
            stroke={tokens.card}
            strokeWidth={2.5}
          />
          <SvgText
            x={2}
            y={CHART_HEIGHT - 4}
            fontFamily={fontFamily.text}
            fontSize={11}
            fontWeight="500"
            fill={tokens.muted}
          >
            {formatDate(from, { month: 'short', day: 'numeric' })}
          </SvgText>
          <SvgText
            x={geometry.right + 4}
            y={CHART_HEIGHT - 4}
            textAnchor="end"
            fontFamily={fontFamily.text}
            fontSize={11}
            fontWeight="500"
            fill={tokens.muted}
          >
            {t('progress.tab.body.today.label')}
          </SvgText>
        </Svg>
      ) : null}
    </View>
  );
}
