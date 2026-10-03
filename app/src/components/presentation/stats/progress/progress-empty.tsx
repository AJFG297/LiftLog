import { ActionButton } from '@/components/presentation/foundation/action-button';
import { Card } from '@/components/presentation/foundation/card';
import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { spacing, useAppTheme } from '@/hooks/useAppTheme';

interface ProgressEmptyProps {
  title: string;
  body: string;
  action: { label: string; onPress: () => void };
}

/** The Progress tab before the first finished workout. */
export function ProgressEmpty({ title, body, action }: ProgressEmptyProps) {
  const { tokens } = useAppTheme();
  return (
    <Card testID="progress-empty" style={{ gap: spacing[2] }}>
      <SurfaceText font="text-lg" weight="700" accessibilityRole="header" style={{ color: tokens.ink }}>
        {title}
      </SurfaceText>
      <SurfaceText font="text-sm" style={{ color: tokens.muted }}>
        {body}
      </SurfaceText>
      <ActionButton
        variant="secondary"
        label={action.label}
        onPress={action.onPress}
        style={{ marginTop: spacing[2] }}
      />
    </Card>
  );
}
