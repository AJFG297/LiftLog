import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { spacing, useAppTheme } from '@/hooks/useAppTheme';
import { View } from 'react-native';

interface StatCardProps {
  label: string;
  /** Only digits and number punctuation: set in Geist Mono. */
  value: string;
  unit?: string;
  caption?: string;
  /** Colours the caption: `positive` for a rise, `drop` for a fall. Pair it with an arrow or words, never colour alone. */
  captionTone?: 'muted' | 'positive' | 'drop';
  /** The dark slab that makes the records card stand out. */
  inverse?: boolean;
}

/** One figure on the workout summary: duration, volume, sets or records. */
export function StatCard({ label, value, unit, caption, captionTone = 'muted', inverse }: StatCardProps) {
  const { tokens } = useAppTheme();
  const muted = inverse ? tokens.inverseMuted : tokens.muted;
  const captionColor = captionTone === 'positive' ? tokens.positive : captionTone === 'drop' ? tokens.danger : muted;
  return (
    <View
      accessible
      style={{
        flex: 1,
        gap: spacing[0.5],
        padding: 14,
        borderRadius: 16,
        borderWidth: inverse ? 0 : 1,
        borderColor: tokens.line,
        backgroundColor: inverse ? tokens.inverse : tokens.card,
      }}
    >
      <SurfaceText font="text-xs" weight="500" style={{ color: muted }}>
        {label}
      </SurfaceText>
      <SurfaceText font="text-2xl" numeric weight="600" style={{ color: inverse ? tokens.invAccent : tokens.ink }}>
        {value}
        {unit ? (
          <SurfaceText font="text-sm" style={{ color: muted }}>
            {` ${unit}`}
          </SurfaceText>
        ) : null}
      </SurfaceText>
      {caption ? (
        <SurfaceText
          font="text-xs"
          weight={captionTone === 'muted' ? undefined : '600'}
          style={{ color: captionColor }}
        >
          {caption}
        </SurfaceText>
      ) : null}
    </View>
  );
}
