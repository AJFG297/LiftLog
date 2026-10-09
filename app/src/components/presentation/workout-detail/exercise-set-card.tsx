import { Card } from '@/components/presentation/foundation/card';
import { MsIconSrc } from '@/components/presentation/foundation/ms-icon-source';
import { MIN_TOUCH_TARGET } from '@/components/presentation/foundation/touch-target';
import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { spacing, tabularText, useAppTheme } from '@/hooks/useAppTheme';
import { DetailSetLabel } from '@/models/workout-detail';
import { Pressable, View } from 'react-native';

/** One set row, already formatted for the table. */
export interface SetRowCopy {
  key: string;
  label: DetailSetLabel;
  /** The badge's text: the working set's number, or W, D, M or F. */
  labelText: string;
  weight: string;
  reps: string;
  /** "@8", shown after the reps when the set was rated. */
  rpe: string | undefined;
  /** "–" where the set can't set a record. */
  oneRepMax: string;
  pr: boolean;
  /** The whole row read out as one: "Set 1, 90 kg, 5 reps, RPE 8, e1RM 105, personal record". */
  spoken: string;
}

interface ExerciseSetCardProps {
  name: string;
  /** The one-line comparison with last time ("+2.5 kg vs last"). */
  note: string | undefined;
  headings: { set: string; weight: string; reps: string; oneRepMax: string };
  prLabel: string;
  rows: SetRowCopy[];
  /** Shown in place of the table when there are no rows: "Not done", or a cardio exercise's summary. */
  fallbackText: string;
  /** Makes the name open the exercise's progress; absent for an exercise with no progress page (cardio). */
  openExercise?: {
    onPress: () => void;
    /** The name as a screen reader hears the link: "Bench Press, view progress". */
    accessibilityLabel: string;
  };
}

const SET_COLUMN = 36;
const ONE_REP_MAX_COLUMN = 76;

/** An exercise in a past workout: its logged sets as a table, with e1RM and the record-setting set tagged. */
export function ExerciseSetCard({
  name,
  note,
  headings,
  prLabel,
  rows,
  fallbackText,
  openExercise,
}: ExerciseSetCardProps) {
  const { tokens } = useAppTheme();
  const headingStyle = { color: tokens.muted, letterSpacing: 0.7, textTransform: 'uppercase' } as const;
  return (
    <Card style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: spacing[2] }}>
        {openExercise ? (
          <Pressable
            onPress={openExercise.onPress}
            accessibilityRole="link"
            accessibilityLabel={openExercise.accessibilityLabel}
            // A 44pt target that takes no more room than the name: the card's padding is above and below it.
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing[0.5],
              flexShrink: 1,
              minHeight: MIN_TOUCH_TARGET,
              marginVertical: -10,
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <SurfaceText font="text-base" weight="600" style={{ color: tokens.ink, flexShrink: 1 }}>
              {name}
            </SurfaceText>
            <MsIconSrc name="chevronRight" size={18} color={tokens.muted} />
          </Pressable>
        ) : (
          <SurfaceText font="text-base" weight="600" style={{ color: tokens.ink, flexShrink: 1 }}>
            {name}
          </SurfaceText>
        )}
        {note ? (
          <SurfaceText font="text-xs" style={[tabularText, { color: tokens.muted }]}>
            {note}
          </SurfaceText>
        ) : null}
      </View>
      {rows.length ? (
        <View>
          <View
            importantForAccessibility="no-hide-descendants"
            accessibilityElementsHidden
            style={{ flexDirection: 'row', paddingBottom: spacing[1] }}
          >
            <SurfaceText font="text-2xs" weight="600" style={[headingStyle, { width: SET_COLUMN }]}>
              {headings.set}
            </SurfaceText>
            <SurfaceText font="text-2xs" weight="600" style={[headingStyle, { flex: 1 }]}>
              {headings.weight}
            </SurfaceText>
            <SurfaceText font="text-2xs" weight="600" style={[headingStyle, { flex: 1 }]}>
              {headings.reps}
            </SurfaceText>
            <SurfaceText
              font="text-2xs"
              weight="600"
              style={[headingStyle, { width: ONE_REP_MAX_COLUMN, textAlign: 'right' }]}
            >
              {headings.oneRepMax}
            </SurfaceText>
          </View>
          {rows.map((row) => (
            <View
              key={row.key}
              accessible
              accessibilityLabel={row.spoken}
              style={{ flexDirection: 'row', alignItems: 'center', minHeight: 28 }}
            >
              <SurfaceText
                font="text-base"
                numeric
                weight="500"
                style={{ width: SET_COLUMN, color: labelColor(row.label, tokens) }}
              >
                {row.labelText}
              </SurfaceText>
              <SurfaceText font="text-base" numeric weight="500" style={{ flex: 1, color: tokens.ink }}>
                {row.weight}
              </SurfaceText>
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                <SurfaceText font="text-base" numeric weight="500" style={{ color: tokens.ink }}>
                  {row.reps}
                </SurfaceText>
                {row.rpe ? (
                  <SurfaceText font="text-sm" numeric weight="500" style={{ color: tokens.muted }}>
                    {row.rpe}
                  </SurfaceText>
                ) : null}
              </View>
              <View
                style={{
                  width: ONE_REP_MAX_COLUMN,
                  flexDirection: 'row',
                  justifyContent: 'flex-end',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                {row.pr ? (
                  <View
                    style={{
                      backgroundColor: tokens.accentSoft,
                      borderRadius: 5,
                      paddingHorizontal: 5,
                      paddingVertical: 1,
                    }}
                  >
                    <SurfaceText font="text-2xs" weight="700" style={{ color: tokens.accentSoftInk }}>
                      {prLabel}
                    </SurfaceText>
                  </View>
                ) : null}
                <SurfaceText font="text-base" numeric weight="500" style={{ color: tokens.muted }}>
                  {row.oneRepMax}
                </SurfaceText>
              </View>
            </View>
          ))}
        </View>
      ) : (
        <SurfaceText font="text-sm" style={{ color: tokens.muted }}>
          {fallbackText}
        </SurfaceText>
      )}
    </Card>
  );
}

function labelColor(label: DetailSetLabel, tokens: ReturnType<typeof useAppTheme>['tokens']): string {
  switch (label.kind) {
    case 'warmup':
      return tokens.warmInk;
    case 'failure':
      return tokens.danger;
    default:
      return tokens.muted;
  }
}
