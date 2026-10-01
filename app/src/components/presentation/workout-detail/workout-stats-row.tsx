import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { spacing, useAppTheme } from '@/hooks/useAppTheme';
import { View } from 'react-native';

export interface WorkoutStat {
  key: string;
  /** Only digits and number punctuation, set in Geist Mono ("49m" is the one exception, as on the summary). */
  value: string;
  label: string;
  /** Draws the value in the accent: the records count, when there are any. */
  highlight?: boolean;
}

/** One card with the workout's figures side by side, split by hairlines: duration, volume, sets, PRs. */
export function WorkoutStatsRow({ stats }: { stats: WorkoutStat[] }) {
  const { tokens } = useAppTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: tokens.card,
        borderWidth: 1,
        borderColor: tokens.line,
        borderRadius: 16,
        paddingVertical: 14,
        paddingHorizontal: spacing[1],
      }}
    >
      {stats.map((stat, index) => (
        <View
          key={stat.key}
          accessible
          accessibilityLabel={`${stat.label}: ${stat.value}`}
          style={{
            flex: 1,
            alignItems: 'center',
            gap: spacing[0.5],
            borderLeftWidth: index === 0 ? 0 : 1,
            borderLeftColor: tokens.line,
          }}
        >
          <SurfaceText
            font="text-lg"
            numeric
            weight="600"
            numberOfLines={1}
            adjustsFontSizeToFit
            style={{ color: stat.highlight ? tokens.accentInk : tokens.ink }}
          >
            {stat.value}
          </SurfaceText>
          <SurfaceText font="text-xs" numberOfLines={1} style={{ color: tokens.muted }}>
            {stat.label}
          </SurfaceText>
        </View>
      ))}
    </View>
  );
}
