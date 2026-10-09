import { Card } from '@/components/presentation/foundation/card';
import { MsIconSrc } from '@/components/presentation/foundation/ms-icon-source';
import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { AmountText } from '@/components/presentation/stats/amount-text';
import { ListCard, useRowDivider } from '@/components/presentation/stats/list-parts';
import { spacing, tabularText, useAppTheme } from '@/hooks/useAppTheme';
import { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

/** What the next session of the routine that plans the exercise opens it on. */
export function NextTimeCard(props: {
  title: string;
  target: string;
  line: string;
  /** The card read out as one: "Next time: 85 kg × 5. Push A · you hit 8 reps, so +2.5 kg". */
  spoken: string;
}) {
  const { tokens } = useAppTheme();
  return (
    <View
      testID="exercise-next-time"
      accessible
      accessibilityLabel={props.spoken}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        paddingVertical: 14,
        paddingHorizontal: spacing[4],
        borderRadius: 18,
        borderWidth: 1,
        borderColor: tokens.accentLine,
        backgroundColor: tokens.wash,
      }}
    >
      <View style={{ flex: 1, gap: spacing[0.5] }}>
        <SurfaceText weight="600" style={{ fontSize: 12, lineHeight: 16, color: tokens.accentInk }}>
          {props.title}
        </SurfaceText>
        <SurfaceText weight="600" style={[tabularText, { fontSize: 20, lineHeight: 26, color: tokens.ink }]}>
          {props.target}
        </SurfaceText>
        <SurfaceText style={{ fontSize: 13, lineHeight: 18, color: tokens.muted }}>{props.line}</SurfaceText>
      </View>
      <MsIconSrc name="trendingUp" size={22} color={tokens.accentInk} />
    </View>
  );
}

export interface RepBestCell {
  /** "5 reps". */
  label: string;
  /** "62.5", or "–" when never lifted for that many. */
  amount: string;
  /** Left out with no amount. */
  unit: string | undefined;
  /** "Sep 23". */
  date: string | undefined;
  spoken: string;
}

/** Best weight by reps: one column per rep count, in a single card. */
export function RepBestsCard({ cells }: { cells: readonly RepBestCell[] }) {
  const { tokens } = useAppTheme();
  return (
    <Card style={{ flexDirection: 'row', paddingVertical: 14, paddingHorizontal: spacing[2] }}>
      {cells.map((cell, index) => (
        <View
          key={cell.label}
          accessible
          accessibilityLabel={cell.spoken}
          style={{
            flex: 1,
            alignItems: 'center',
            gap: spacing[0.5],
            borderLeftWidth: index ? 1 : 0,
            borderLeftColor: tokens.line,
          }}
        >
          <SurfaceText weight="500" style={{ fontSize: 12, lineHeight: 16, color: tokens.muted }}>
            {cell.label}
          </SurfaceText>
          <AmountText
            amount={cell.amount}
            unit={cell.unit}
            style={{ fontSize: 19, lineHeight: 24, fontWeight: '600', color: tokens.ink }}
            unitStyle={{ fontSize: 12, fontWeight: '500', color: tokens.muted }}
          />
          <SurfaceText style={{ fontSize: 11, lineHeight: 14, color: tokens.muted }}>{cell.date ?? ' '}</SurfaceText>
        </View>
      ))}
    </Card>
  );
}

export interface RecentSessionRow {
  key: string;
  /** "SEP", shown upper case. */
  month: string;
  day: number;
  /** The best set, as spans. */
  set: ReactNode;
  /** "4 sets · 4,410 kg". */
  summary: string;
  record: boolean;
  /** "77" and "est. 1RM"; nothing when the workout has none. */
  value: string | undefined;
  valueLabel: string;
  selected: boolean;
  spoken: string;
  onPress: () => void;
}

/** Last 5 times: a row per workout, newest first. Tapping one picks it on the chart. */
export function RecentSessionsCard({ rows, prLabel }: { rows: readonly RecentSessionRow[]; prLabel: string }) {
  const { tokens } = useAppTheme();
  const divider = useRowDivider();
  return (
    <ListCard>
      {rows.map((row, index) => (
        <Pressable
          key={row.key}
          testID={`exercise-recent-${index}`}
          onPress={row.onPress}
          accessibilityRole="button"
          accessibilityState={{ selected: row.selected }}
          accessibilityLabel={row.spoken}
          style={({ pressed }) => [
            {
              flexDirection: 'row',
              alignItems: 'center',
              gap: 14,
              paddingVertical: spacing[3],
              paddingHorizontal: 14,
              minHeight: 56,
              backgroundColor: row.selected ? tokens.wash : pressed ? tokens.track : undefined,
            },
            divider(index),
          ]}
        >
          <View style={{ width: 40, alignItems: 'center', flexShrink: 0 }}>
            <SurfaceText
              weight="600"
              style={{
                fontSize: 11,
                lineHeight: 14,
                letterSpacing: 0.66,
                textTransform: 'uppercase',
                color: tokens.muted,
              }}
            >
              {row.month}
            </SurfaceText>
            <SurfaceText numeric weight="600" style={{ fontSize: 20, lineHeight: 26, color: tokens.ink }}>
              {row.day}
            </SurfaceText>
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: spacing[0.5] }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
              <SurfaceText
                numberOfLines={1}
                weight="600"
                style={{ fontSize: 15, lineHeight: 20, color: tokens.ink, flexShrink: 1 }}
              >
                {row.set}
              </SurfaceText>
              {row.record ? (
                <View
                  style={{
                    paddingVertical: 2,
                    paddingHorizontal: 6,
                    borderRadius: 6,
                    backgroundColor: tokens.accentSoft,
                  }}
                >
                  <SurfaceText weight="700" style={{ fontSize: 11, lineHeight: 14, color: tokens.accentSoftInk }}>
                    {prLabel}
                  </SurfaceText>
                </View>
              ) : null}
            </View>
            <SurfaceText numberOfLines={1} style={{ fontSize: 13, lineHeight: 18, color: tokens.muted }}>
              {row.summary}
            </SurfaceText>
          </View>
          <View style={{ flexShrink: 0, alignItems: 'flex-end', gap: 1 }}>
            <SurfaceText numeric weight="600" style={{ fontSize: 16, lineHeight: 22, color: tokens.ink }}>
              {row.value ?? '–'}
            </SurfaceText>
            <SurfaceText style={{ fontSize: 11, lineHeight: 14, color: tokens.muted }}>{row.valueLabel}</SurfaceText>
          </View>
        </Pressable>
      ))}
    </ListCard>
  );
}

export interface RecordTimelineRow {
  key: string;
  /** "Heaviest" or "Est. 1RM". */
  kind: string;
  /** "130 kg × 3" or "104.5 kg", as spans. */
  value: ReactNode;
  /** "Wed, Sep 23". */
  date: string;
  /** "+2.5 kg". */
  gain: string | undefined;
  spoken: string;
}

/** The exercise's latest records as a timeline, the newest on top with the accent dot. */
export function RecordTimeline({ rows }: { rows: readonly RecordTimelineRow[] }) {
  const { tokens } = useAppTheme();
  return (
    <Card style={{ paddingVertical: 6, paddingHorizontal: spacing[4] }}>
      {rows.map((row, index) => (
        <View
          key={row.key}
          accessible
          accessibilityLabel={row.spoken}
          style={{ flexDirection: 'row', alignItems: 'stretch', gap: 14 }}
        >
          <View style={{ width: 10, alignItems: 'center', flexShrink: 0 }}>
            <View style={{ width: 2, height: 18, backgroundColor: index ? tokens.line : 'transparent' }} />
            <View
              style={{
                width: 10,
                height: 10,
                borderRadius: 5,
                backgroundColor: index ? tokens.line3 : tokens.accentInk,
              }}
            />
            <View
              style={{
                width: 2,
                flexGrow: 1,
                backgroundColor: index === rows.length - 1 ? 'transparent' : tokens.line,
              }}
            />
          </View>
          <View
            style={{
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing[3],
              paddingVertical: 10,
              minWidth: 0,
            }}
          >
            <View style={{ flex: 1, minWidth: 0, gap: spacing[0.5] }}>
              <SurfaceText weight="600" style={{ fontSize: 15, lineHeight: 20, color: tokens.ink }}>
                {`${row.kind} · `}
                {row.value}
              </SurfaceText>
              <SurfaceText style={{ fontSize: 13, lineHeight: 18, color: tokens.muted }}>{row.date}</SurfaceText>
            </View>
            {row.gain ? (
              <View
                style={{
                  flexShrink: 0,
                  paddingVertical: 3,
                  paddingHorizontal: 7,
                  borderRadius: 7,
                  backgroundColor: tokens.accentSoft,
                }}
              >
                {/* The board sets the whole badge, unit included, in bold Geist Mono, as on the record rows. */}
                <SurfaceText numeric weight="700" style={{ fontSize: 12, lineHeight: 16, color: tokens.accentSoftInk }}>
                  {row.gain}
                </SurfaceText>
              </View>
            ) : null}
          </View>
        </View>
      ))}
    </Card>
  );
}
