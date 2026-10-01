import { MsIconSrc } from '@/components/presentation/foundation/ms-icon-source';
import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { spacing, useAppTheme } from '@/hooks/useAppTheme';
import { View } from 'react-native';

interface HomeHeaderProps {
  /** "Sunday, Sep 27". */
  date: string;
  title: string;
  /** "4 week streak"; left out when there's no streak to speak of. */
  streak: string | undefined;
}

export function HomeHeader({ date, title, streak }: HomeHeaderProps) {
  const { tokens } = useAppTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        gap: spacing[3],
        paddingHorizontal: spacing[1],
      }}
    >
      <View style={{ flexShrink: 1, gap: spacing[1] }}>
        <SurfaceText font="text-sm" weight="500" style={{ color: tokens.muted }}>
          {date}
        </SurfaceText>
        <SurfaceText
          accessibilityRole="header"
          font="text-3xl"
          weight="700"
          style={{ color: tokens.ink, letterSpacing: -0.6, lineHeight: 34 }}
        >
          {title}
        </SurfaceText>
      </View>
      {streak ? (
        <View
          testID="home-streak"
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            minHeight: 36,
            paddingHorizontal: spacing[3],
            borderRadius: 18,
            borderWidth: 1,
            borderColor: tokens.line,
            backgroundColor: tokens.card,
          }}
        >
          <MsIconSrc name="localFireDepartment" size={16} color={tokens.accentInk} />
          <SurfaceText font="text-sm" weight="600" style={{ color: tokens.ink }}>
            {streak}
          </SurfaceText>
        </View>
      ) : null}
    </View>
  );
}
