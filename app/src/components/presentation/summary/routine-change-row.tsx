import { AppIconName, MsIconSrc } from '@/components/presentation/foundation/ms-icon-source';
import { haptics } from '@/components/presentation/foundation/haptics';
import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { spacing, useAppTheme } from '@/hooks/useAppTheme';
import { Pressable, View } from 'react-native';

interface RoutineChangeRowProps {
  icon: AppIconName;
  title: string;
  subtitle: string;
  selected: boolean;
  onToggle: () => void;
}

/** One change on the "Update your routine?" sheet, kept for next time while it is ticked. */
export function RoutineChangeRow({ icon, title, subtitle, selected, onToggle }: RoutineChangeRowProps) {
  const { tokens } = useAppTheme();
  return (
    <Pressable
      onPress={() => {
        haptics.selection();
        onToggle();
      }}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={`${title}. ${subtitle}`}
    >
      {({ pressed }) => (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing[3],
            paddingVertical: spacing[3],
            paddingHorizontal: 14,
            borderRadius: 14,
            borderWidth: selected ? 1.5 : 1,
            borderColor: selected ? tokens.accentInk : tokens.line,
            backgroundColor: pressed ? tokens.track : selected ? tokens.wash : tokens.card,
          }}
        >
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              backgroundColor: tokens.bg,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <MsIconSrc name={icon} size={18} color={tokens.ink} />
          </View>
          <View style={{ flex: 1, gap: spacing[0.5] }}>
            <SurfaceText font="text-base" weight="600" style={{ color: tokens.ink }}>
              {title}
            </SurfaceText>
            <SurfaceText font="text-sm" style={{ color: tokens.muted }}>
              {subtitle}
            </SurfaceText>
          </View>
          <View
            style={{
              width: 24,
              height: 24,
              borderRadius: 7,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: selected ? tokens.accent : tokens.card,
              borderWidth: selected ? 0 : 1.5,
              borderColor: tokens.line3,
            }}
          >
            {selected ? <MsIconSrc name="check" size={16} color={tokens.onAccent} /> : null}
          </View>
        </View>
      )}
    </Pressable>
  );
}
