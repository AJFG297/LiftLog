import { ExerciseSummaryLine } from '@/components/presentation/summary/exercise-summary-line';
import { ColorChoice, spacing } from '@/hooks/useAppTheme';
import { Session } from '@/models/session-models';
import { View } from 'react-native';

interface SessionSummaryProps {
  session: Session;
  isFilled?: boolean;
  showWeight?: boolean;
  color?: ColorChoice;
  secondaryColor?: ColorChoice;
}
export default function SessionSummary({ session, isFilled, showWeight, color, secondaryColor }: SessionSummaryProps) {
  return (
    <View style={{ gap: spacing[1] }} testID="session-summary">
      {session.recordedExercises
        // Summary lines describe working sets, so an exercise where only the warm-ups got done has none.
        .filter((x) => !isFilled || x.isStarted)
        .map((ex, index) => (
          <ExerciseSummaryLine
            key={index}
            exercise={ex}
            isFilled={!!isFilled}
            showWeight={!!showWeight}
            color={color}
            secondaryColor={secondaryColor}
          />
        ))}
    </View>
  );
}
