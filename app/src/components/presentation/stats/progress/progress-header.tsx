import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { spacing, useAppTheme } from '@/hooks/useAppTheme';
import { View } from 'react-native';

interface ProgressHeaderProps {
  /** "Since Jul 6": where the range starts. Left out before there's any history. */
  since: string | undefined;
  title: string;
}

export function ProgressHeader({ since, title }: ProgressHeaderProps) {
  const { tokens } = useAppTheme();
  return (
    <View style={{ gap: spacing[1], paddingHorizontal: spacing[1] }}>
      {since ? (
        <SurfaceText font="text-sm" weight="500" style={{ color: tokens.muted }}>
          {since}
        </SurfaceText>
      ) : null}
      <SurfaceText
        accessibilityRole="header"
        font="text-3xl"
        weight="700"
        style={{ color: tokens.ink, letterSpacing: -0.6, lineHeight: 34 }}
      >
        {title}
      </SurfaceText>
    </View>
  );
}
