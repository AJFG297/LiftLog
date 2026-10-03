import { PressableSurface } from '@/components/presentation/foundation/pressable-surface';
import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { amountText, signedText } from '@/components/presentation/stats/amount-format';
import { useRowDivider } from '@/components/presentation/stats/list-parts';
import { numberStyle, useAppTheme } from '@/hooks/useAppTheme';
import { shortFormatWeightUnit, Weight } from '@/models/weight';
import type { RecordListRow } from '@/store/stats/records-list';
import { Text, View } from 'react-native';

interface RecordRowProps {
  row: RecordListRow;
  /** The day's short name ("Mon"). */
  weekday: string;
  /** "Heaviest" or "Est. 1RM". */
  kindLabel: string;
  /**
   * What follows the kind. `set` is the set lifted ("82.5 kg × 8"), as Strength's recent records show it;
   * `record` is the record itself ("130 kg × 3", "104.5 kg"), as the Records list does.
   */
  shows: 'set' | 'record';
  /** A third line ("82.5 kg × 8 · was 102 kg"). */
  detail?: string;
  accessibilityLabel: string;
  index: number;
  onPress: (() => void) | undefined;
  testID?: string;
}

/**
 * A record: the day it was set, the exercise, the kind and value, and the gain. Strength's recent records and
 * the Records list both draw it, so a record looks and reads the same on each.
 */
export function RecordRow(props: RecordRowProps) {
  const { row } = props;
  const { tokens } = useAppTheme();
  const divider = useRowDivider();
  const unit = shortFormatWeightUnit(row.value.unit);
  const amount = amountOf(row, props.shows);
  const gain = signedText(row.gain.value).text;
  return (
    <PressableSurface
      testID={props.testID}
      onPress={props.onPress}
      accessibilityLabel={props.accessibilityLabel}
      surface={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        paddingVertical: 12,
        paddingHorizontal: 14,
        minHeight: 56,
        ...divider(props.index),
      }}
    >
      <View style={{ width: 40, alignItems: 'center', flexShrink: 0 }}>
        <SurfaceText
          weight="600"
          style={{ fontSize: 11, lineHeight: 14, letterSpacing: 0.66, textTransform: 'uppercase', color: tokens.muted }}
        >
          {props.weekday}
        </SurfaceText>
        <SurfaceText numeric weight="600" style={{ fontSize: 20, lineHeight: 26, color: tokens.ink }}>
          {row.date.dayOfMonth()}
        </SurfaceText>
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <SurfaceText numberOfLines={1} weight="600" style={{ fontSize: 15, lineHeight: 20, color: tokens.ink }}>
          {row.exerciseName}
        </SurfaceText>
        <SurfaceText numberOfLines={1} style={{ fontSize: 13, lineHeight: 18, color: tokens.muted }}>
          {`${props.kindLabel} · `}
          <Text style={{ color: tokens.ink }}>
            <Text style={numberStyle}>{amountText(amount.weight.value)}</Text>
            {` ${unit}`}
            {amount.reps === undefined ? null : <Text style={numberStyle}>{` × ${amount.reps}`}</Text>}
          </Text>
        </SurfaceText>
        {props.detail ? (
          <SurfaceText style={{ fontSize: 12, lineHeight: 16, color: tokens.muted }}>{props.detail}</SurfaceText>
        ) : null}
      </View>
      {gain ? (
        <View
          style={{
            flexShrink: 0,
            paddingVertical: 3,
            paddingHorizontal: 7,
            borderRadius: 7,
            backgroundColor: tokens.accentSoft,
          }}
        >
          {/* The board sets the whole badge, unit included, in bold Geist Mono, unlike other amounts. */}
          <SurfaceText numeric weight="700" style={{ fontSize: 12, lineHeight: 16, color: tokens.accentSoftInk }}>
            {`${gain} ${unit}`}
          </SurfaceText>
        </View>
      ) : null}
    </PressableSurface>
  );
}

function amountOf(row: RecordListRow, shows: RecordRowProps['shows']): { weight: Weight; reps?: number } {
  if (row.kind === 'heaviestWeight') {
    return { weight: row.value, reps: row.reps };
  }
  return shows === 'set' ? row.estimatedFrom : { weight: row.value };
}
