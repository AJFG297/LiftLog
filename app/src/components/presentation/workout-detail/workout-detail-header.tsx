import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { spacing, tabularText, useAppTheme } from '@/hooks/useAppTheme';
import { View } from 'react-native';

interface WorkoutDetailHeaderProps {
  /** The program and day ("PPL · Day 1"), when the routine is in the active program. */
  routineLine: string | undefined;
  /** The routine's own colour. Routines don't have one yet, so the accent stands in. */
  routineColor?: string;
  name: string;
  /** The date and the time range ("Wednesday, Sep 23 · 6:04 – 6:53 PM"). */
  dateLine: string;
}

/** The top of a past workout: which routine it was, its name, and when. */
export function WorkoutDetailHeader({ routineLine, routineColor, name, dateLine }: WorkoutDetailHeaderProps) {
  const { tokens } = useAppTheme();
  return (
    <View style={{ gap: 6, paddingHorizontal: spacing[1] }}>
      {routineLine ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
          <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: routineColor ?? tokens.accent }} />
          <SurfaceText font="text-sm" weight="600" style={{ color: tokens.muted }}>
            {routineLine}
          </SurfaceText>
        </View>
      ) : null}
      <SurfaceText font="text-3xl" weight="700" accessibilityRole="header" style={{ color: tokens.ink }}>
        {name}
      </SurfaceText>
      <SurfaceText font="text-sm" style={[tabularText, { color: tokens.muted }]}>
        {dateLine}
      </SurfaceText>
    </View>
  );
}
