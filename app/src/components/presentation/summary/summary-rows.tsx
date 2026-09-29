import { MsIconSrc } from '@/components/presentation/foundation/ms-icon-source';
import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { spacing, tabularText, useAppTheme } from '@/hooks/useAppTheme';
import { View } from 'react-native';

/** A load split so its digits can go in Geist Mono and its unit stay in Geist: "90 kg × 4". */
export interface LoadText {
  amount: string;
  unit: string;
  reps?: number;
}

interface RecordRowProps {
  exerciseName: string;
  kind: string;
  value: LoadText;
  was: string;
}

/** A new personal record: the exercise, what kind of record, the new best and the one it beat. */
export function RecordRow({ exerciseName, kind, value, was }: RecordRowProps) {
  const { tokens } = useAppTheme();
  return (
    <View accessible style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 22,
          backgroundColor: tokens.accentSoft,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <MsIconSrc name="emojiEvents" size={22} color={tokens.accentSoftInk} />
      </View>
      <View style={{ flex: 1, gap: 1 }}>
        <SurfaceText font="text-base" weight="600" style={{ color: tokens.ink }}>
          {exerciseName}
        </SurfaceText>
        <SurfaceText font="text-sm" style={{ color: tokens.muted }}>
          {kind}
        </SurfaceText>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 1 }}>
        <SurfaceText font="text-base" numeric weight="600" style={{ color: tokens.ink }}>
          {value.amount}
          <SurfaceText font="text-base" weight="600" style={{ color: tokens.ink }}>
            {` ${value.unit}`}
          </SurfaceText>
          {value.reps === undefined ? '' : ` × ${value.reps}`}
        </SurfaceText>
        <SurfaceText font="text-xs" style={[{ color: tokens.muted }, tabularText]}>
          {was}
        </SurfaceText>
      </View>
    </View>
  );
}

export type ChangeTone = 'up' | 'down' | 'same' | 'new';

interface BestSetRowProps {
  exerciseName: string;
  best: string;
  /** `best` is only a number ("90 × 4"), so it goes in Geist Mono; otherwise it has words ("12 reps"). */
  bestNumeric: boolean;
  change: string;
  /** Read out instead of `change`, whose arrows mean nothing to a screen reader. */
  changeSpoken: string;
  tone: ChangeTone;
  first: boolean;
}

/**
 * An exercise's best set against last time. The change always carries an arrow or a word as well as its
 * colour, so it reads without colour.
 */
export function BestSetRow({ exerciseName, best, bestNumeric, change, changeSpoken, tone, first }: BestSetRowProps) {
  const { tokens } = useAppTheme();
  const color = { up: tokens.positive, down: tokens.warmInk, same: tokens.muted, new: tokens.accentInk }[tone];
  return (
    <View
      accessible
      accessibilityLabel={`${exerciseName}, ${best}, ${changeSpoken}`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing[2],
        minHeight: 40,
        borderTopWidth: first ? 0 : 1,
        borderTopColor: tokens.track,
      }}
    >
      <SurfaceText font="text-sm" weight="500" style={{ flex: 1, color: tokens.ink }}>
        {exerciseName}
      </SurfaceText>
      <SurfaceText
        font="text-sm"
        numeric={bestNumeric}
        weight="600"
        style={[{ color: tokens.ink }, bestNumeric ? undefined : tabularText]}
      >
        {best}
      </SurfaceText>
      <SurfaceText font="text-xs" weight="700" style={[{ minWidth: 76, textAlign: 'right', color }, tabularText]}>
        {change}
      </SurfaceText>
    </View>
  );
}
