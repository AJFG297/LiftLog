import { amountText } from '@/components/presentation/stats/amount-format';
import { numberStyle } from '@/hooks/useAppTheme';
import { bodyweightPrefix, shortFormatWeightUnit } from '@/models/weight';
import type { ShownSet } from '@/store/stats/exercise-progress';
import { Text } from 'react-native';

export interface SetLabels {
  /** A bodyweight movement: its weight is what is added, and none reads as bodyweight. */
  usesBodyweight: boolean;
  /** "BW". */
  bodyweight: string;
  /** "reps", after a count with no weight. */
  reps: string;
}

/** A set as one string, for a spoken label: "82.5 kg × 8", "BW +10 kg × 6", "BW × 12", "20 reps". */
export function setText(set: ShownSet, labels: SetLabels): string {
  return parts(set, labels)
    .map((part) => part.text)
    .join('');
}

/**
 * A set as spans to nest in a `SurfaceText`: the numbers in Geist Mono, the unit and "BW" in the text's own
 * Geist, as Theming's type rules ask.
 */
export function SetSpans({ set, labels }: { set: ShownSet; labels: SetLabels }) {
  return (
    <>
      {parts(set, labels).map((part, index) =>
        part.numeric ? (
          <Text key={index} style={numberStyle}>
            {part.text}
          </Text>
        ) : (
          part.text
        ),
      )}
    </>
  );
}

function parts(set: ShownSet, labels: SetLabels): { text: string; numeric: boolean }[] {
  const reps = { text: `${set.reps}`, numeric: true };
  if (!set.weight) {
    return [reps, { text: ` ${labels.reps}`, numeric: false }];
  }
  const times = { text: ' × ', numeric: true };
  const unit = { text: ` ${shortFormatWeightUnit(set.weight.unit)}`, numeric: false };
  const value = { text: amountText(set.weight.value), numeric: true };
  if (!labels.usesBodyweight) {
    return [value, unit, times, reps];
  }
  if (set.weight.value.isZero()) {
    return [{ text: labels.bodyweight, numeric: false }, times, reps];
  }
  return [{ text: bodyweightPrefix(labels.bodyweight, set.weight.value), numeric: false }, value, unit, times, reps];
}
