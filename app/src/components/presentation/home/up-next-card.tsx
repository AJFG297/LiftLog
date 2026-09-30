import { Card } from '@/components/presentation/foundation/card';
import { MsIconSrc } from '@/components/presentation/foundation/ms-icon-source';
import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { spacing, useAppTheme } from '@/hooks/useAppTheme';
import type { HexColor } from '@/utils/color';
import { Pressable, View } from 'react-native';

const BUTTON_HEIGHT = 52;
const BUTTON_RADIUS = 16;

interface UpNextCardProps {
  /** "Up next · PPL day 1 of 3". */
  eyebrow: string;
  name: string;
  /** "Bench Press, Overhead Press +3 · ~50 min · last done Wednesday". */
  detail: string | undefined;
  color: HexColor;
  startLabel: string;
  otherLabel: string;
  onStart: () => void;
  onOther: () => void;
}

/** The next workout of the active plan, started with one tap. */
export function UpNextCard(props: UpNextCardProps) {
  const { tokens } = useAppTheme();
  return (
    <Card testID="up-next-card" style={{ borderRadius: 20, gap: spacing[3] + 2 }}>
      <View style={{ gap: spacing[1] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
          <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: props.color }} />
          <SurfaceText font="text-sm" weight="600" numberOfLines={1} style={{ flexShrink: 1, color: tokens.muted }}>
            {props.eyebrow}
          </SurfaceText>
        </View>
        <SurfaceText font="text-2xl" weight="700" numberOfLines={2} style={{ color: tokens.ink, letterSpacing: -0.5 }}>
          {props.name}
        </SurfaceText>
        {props.detail ? (
          <SurfaceText font="text-sm" style={{ color: tokens.muted }}>
            {props.detail}
          </SurfaceText>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', gap: spacing[2] }}>
        <Pressable
          testID="up-next-start"
          onPress={props.onStart}
          accessibilityRole="button"
          style={{ flexGrow: 1, flexShrink: 1 }}
        >
          {({ pressed }) => (
            <View
              style={{
                minHeight: BUTTON_HEIGHT,
                borderRadius: BUTTON_RADIUS,
                paddingHorizontal: spacing[4],
                backgroundColor: tokens.accent,
                opacity: pressed ? 0.85 : 1,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: spacing[2],
              }}
            >
              <MsIconSrc name="playArrow" size={20} color={tokens.onAccent} />
              <SurfaceText
                font="text-base"
                weight="600"
                numberOfLines={1}
                style={{ color: tokens.onAccent, flexShrink: 1 }}
              >
                {props.startLabel}
              </SurfaceText>
            </View>
          )}
        </Pressable>
        <Pressable testID="up-next-other" onPress={props.onOther} accessibilityRole="button">
          {({ pressed }) => (
            <View
              style={{
                minHeight: BUTTON_HEIGHT,
                borderRadius: BUTTON_RADIUS,
                paddingHorizontal: spacing[4],
                borderWidth: 1,
                borderColor: tokens.line,
                backgroundColor: pressed ? tokens.track : tokens.card,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <SurfaceText font="text-base" weight="600" style={{ color: tokens.ink }}>
                {props.otherLabel}
              </SurfaceText>
            </View>
          )}
        </Pressable>
      </View>
    </Card>
  );
}
