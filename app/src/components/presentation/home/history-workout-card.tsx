import { MsIconSrc } from '@/components/presentation/foundation/ms-icon-source';
import { PressableSurface } from '@/components/presentation/foundation/pressable-surface';
import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { spacing, tabularText, useAppTheme } from '@/hooks/useAppTheme';
import type { HexColor } from '@/utils/color';
import { View } from 'react-native';

const DATE_COLUMN = 44;

interface HistoryWorkoutCardProps {
  /** "Tue". */
  weekday: string;
  dayOfMonth: number;
  name: string;
  color: HexColor;
  /** "PR", shown as a badge when the workout set a personal record. */
  prLabel: string | undefined;
  /** "58 min · 7,070 kg · 14 sets". */
  meta: string;
  /** "Squat, Lunges, Leg Extension +1". */
  exercises: string;
  onPress: () => void;
}

/** A past workout on Home. The whole card opens it. */
export function HistoryWorkoutCard(props: HistoryWorkoutCardProps) {
  const { tokens } = useAppTheme();
  return (
    <PressableSurface
      testID="home-history-card"
      onPress={props.onPress}
      surface={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing[3] + 2,
        padding: spacing[3] + 2,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: tokens.line,
        backgroundColor: tokens.card,
      }}
    >
      <View style={{ width: DATE_COLUMN, alignItems: 'center' }}>
        <SurfaceText
          font="text-2xs"
          weight="600"
          style={{ color: tokens.muted, textTransform: 'uppercase', letterSpacing: 0.6, fontSize: 11 }}
        >
          {props.weekday}
        </SurfaceText>
        <SurfaceText font="text-xl" numeric weight="600" style={{ color: tokens.ink, fontSize: 22 }}>
          {props.dayOfMonth}
        </SurfaceText>
      </View>
      <View style={{ width: 4, alignSelf: 'stretch', borderRadius: 2, backgroundColor: props.color }} />
      <View style={{ flex: 1, gap: 3, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
          <SurfaceText font="text-base" weight="600" numberOfLines={1} style={{ color: tokens.ink, flexShrink: 1 }}>
            {props.name}
          </SurfaceText>
          {props.prLabel ? (
            <View
              style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: tokens.accentSoft }}
            >
              <SurfaceText font="text-2xs" weight="700" style={{ color: tokens.accentSoftInk, fontSize: 11 }}>
                {props.prLabel}
              </SurfaceText>
            </View>
          ) : null}
        </View>
        <SurfaceText font="text-sm" style={[tabularText, { color: tokens.muted, fontSize: 13 }]}>
          {props.meta}
        </SurfaceText>
        {props.exercises ? (
          <SurfaceText font="text-sm" numberOfLines={1} style={{ color: tokens.ink, fontSize: 13 }}>
            {props.exercises}
          </SurfaceText>
        ) : null}
      </View>
      <MsIconSrc name="chevronRight" size={18} color={tokens.muted} />
    </PressableSurface>
  );
}

/** A day without a workout, in the 7-day view: a thin line rather than a card. */
export function HistoryRestRow({ day, label }: { day: string; label: string }) {
  const { tokens } = useAppTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing[3] + 2,
        paddingVertical: spacing[1],
        paddingHorizontal: spacing[3] + 2,
      }}
      accessible
      accessibilityLabel={`${day}, ${label}`}
    >
      <SurfaceText
        font="text-xs"
        weight="600"
        style={[tabularText, { width: DATE_COLUMN, textAlign: 'center', color: tokens.muted }]}
      >
        {day}
      </SurfaceText>
      <View style={{ flex: 1, height: 1, backgroundColor: tokens.line }} />
      <SurfaceText font="text-xs" style={{ color: tokens.muted }}>
        {label}
      </SurfaceText>
    </View>
  );
}
