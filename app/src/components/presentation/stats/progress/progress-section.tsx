import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { MIN_TOUCH_TARGET } from '@/components/presentation/foundation/touch-target';
import { spacing, useAppTheme } from '@/hooks/useAppTheme';
import { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

interface ProgressSectionProps {
  title: string;
  /** A line under the title. */
  subtitle?: string;
  /** A link at the end of the title row ("See all"). */
  action?: { label: string; onPress: () => void; testID?: string };
  children: ReactNode;
}

/** A titled block on the Progress tab: the heading, an optional link and line under it, then its card. */
export function ProgressSection({ title, subtitle, action, children }: ProgressSectionProps) {
  const { tokens } = useAppTheme();
  return (
    <View style={{ gap: spacing[2] + 2 }}>
      <View style={{ paddingHorizontal: spacing[1], gap: spacing[0.5] }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            minHeight: action ? MIN_TOUCH_TARGET : undefined,
          }}
        >
          <SurfaceText
            font="text-lg"
            weight="700"
            accessibilityRole="header"
            style={{ color: tokens.ink, letterSpacing: -0.18, flexShrink: 1 }}
          >
            {title}
          </SurfaceText>
          {action ? (
            <Pressable
              testID={action.testID}
              onPress={action.onPress}
              accessibilityRole="link"
              style={{ minHeight: MIN_TOUCH_TARGET, justifyContent: 'center', paddingLeft: spacing[3] }}
            >
              <SurfaceText font="text-sm" weight="600" style={{ color: tokens.accentInk }}>
                {action.label}
              </SurfaceText>
            </Pressable>
          ) : null}
        </View>
        {subtitle ? (
          <SurfaceText style={{ fontSize: 13, lineHeight: 18, color: tokens.muted }}>{subtitle}</SurfaceText>
        ) : null}
      </View>
      {children}
    </View>
  );
}
