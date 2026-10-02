import { PressableSurface } from '@/components/presentation/foundation/pressable-surface';
import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { numberStyle, useAppTheme } from '@/hooks/useAppTheme';
import { shortFormatWeightUnit, Weight } from '@/models/weight';
import { RecordRow as RecordRowModel } from '@/store/stats/records-list';
import { localeFormatBigNumber } from '@/utils/locale-bignumber';
import { Text, View } from 'react-native';

interface RecordRowProps {
  row: RecordRowModel;
  /** The day's short name ("Mon"). */
  weekday: string;
  /** "Heaviest" or "Est. 1RM". */
  kindLabel: string;
  /** "was 127.5 kg". */
  wasText: string;
  accessibilityLabel: string;
  first: boolean;
  onPress: (() => void) | undefined;
}

/** A record: the day it was set, the exercise, the kind and value, what it beat, and the gain. */
export function RecordRow({ row, weekday, kindLabel, wasText, accessibilityLabel, first, onPress }: RecordRowProps) {
  const { tokens } = useAppTheme();
  const unit = shortFormatWeightUnit(row.value.unit);
  const content = (
    <>
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
          {weekday}
        </SurfaceText>
        <SurfaceText numeric weight="600" style={{ fontSize: 20, lineHeight: 26, color: tokens.ink }}>
          {row.date.dayOfMonth()}
        </SurfaceText>
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <SurfaceText numberOfLines={1} weight="600" style={{ fontSize: 15, lineHeight: 20, color: tokens.ink }}>
          {row.exerciseName}
        </SurfaceText>
        <SurfaceText style={{ fontSize: 13, lineHeight: 18, color: tokens.muted }}>
          {`${kindLabel} · `}
          <Text style={{ color: tokens.ink }}>
            <Text style={numberStyle}>{amountText(row.value)}</Text>
            {` ${unit}`}
            {row.reps === undefined ? null : <Text style={numberStyle}>{` × ${row.reps}`}</Text>}
          </Text>
        </SurfaceText>
        <SurfaceText style={{ fontSize: 12, lineHeight: 16, color: tokens.muted }}>{wasText}</SurfaceText>
      </View>
      <View
        style={{
          flexShrink: 0,
          paddingVertical: 3,
          paddingHorizontal: 7,
          borderRadius: 7,
          backgroundColor: tokens.accentSoft,
        }}
      >
        <SurfaceText weight="600" style={{ fontSize: 12, lineHeight: 16, color: tokens.accentSoftInk }}>
          <Text style={[numberStyle, { fontWeight: '600' }]}>{`+${amountText(row.gain)}`}</Text>
          {` ${unit}`}
        </SurfaceText>
      </View>
    </>
  );
  const surface = {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderTopWidth: first ? 0 : 1,
    borderTopColor: tokens.line,
  } as const;
  return onPress ? (
    <PressableSurface surface={surface} onPress={onPress} accessibilityLabel={accessibilityLabel}>
      {content}
    </PressableSurface>
  ) : (
    <View style={surface} accessible accessibilityLabel={accessibilityLabel}>
      {content}
    </View>
  );
}

export function amountText(weight: Weight): string {
  return localeFormatBigNumber(weight.value);
}
