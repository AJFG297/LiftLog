import { Card } from '@/components/presentation/foundation/card';
import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { spacing, useAppTheme } from '@/hooks/useAppTheme';
import { ReactNode } from 'react';
import { View } from 'react-native';

/** A list page's own title, under the native header's back button, with an optional line below it. */
export function ListPageTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  const { tokens } = useAppTheme();
  return (
    <View style={{ gap: spacing[1], paddingHorizontal: spacing[1] }}>
      <SurfaceText
        accessibilityRole="header"
        weight="700"
        style={{ fontSize: 28, lineHeight: 31, letterSpacing: -0.56, color: tokens.ink }}
      >
        {title}
      </SurfaceText>
      {subtitle ? (
        <SurfaceText font="text-sm" style={{ color: tokens.muted }}>
          {subtitle}
        </SurfaceText>
      ) : null}
    </View>
  );
}

/** One card holding a list's rows, each after the first divided from the one above by a hairline. */
export function ListCard({ children }: { children: ReactNode }) {
  return <Card style={{ padding: 0, overflow: 'hidden' }}>{children}</Card>;
}

/** What a list shows instead of rows: what's missing, and why. */
export function ListEmptyState({ title, body }: { title: string; body: string }) {
  const { tokens } = useAppTheme();
  return (
    <View style={{ paddingVertical: spacing[8], paddingHorizontal: spacing[4], gap: 6 }}>
      <SurfaceText font="text-base" weight="600" style={{ color: tokens.ink, textAlign: 'center' }}>
        {title}
      </SurfaceText>
      <SurfaceText font="text-sm" style={{ color: tokens.muted, textAlign: 'center' }}>
        {body}
      </SurfaceText>
    </View>
  );
}
