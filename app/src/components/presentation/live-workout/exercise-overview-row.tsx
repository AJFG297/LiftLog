import { MsIconSrc } from '@/components/presentation/foundation/ms-icon-source';
import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { spacing, useAppTheme } from '@/hooks/useAppTheme';
import { ExerciseStatus } from '@/models/session-models/exercise-groups';
import { useTranslate } from '@tolgee/react';
import { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

const DOT_SIZE = 34;

interface ExerciseOverviewRowProps {
  /** "3", or "A1" in a superset. */
  label: string;
  name: string;
  subtitle: string;
  status: ExerciseStatus;
  isCurrent: boolean;
  /** A member of a superset, drawn on the page colour under its group's header. */
  inSuperset: boolean;
  /** The drag handle, or a spacer of the same width. */
  leading: ReactNode;
  onPress: () => void;
  testID?: string;
}

/** One exercise in the "All exercises" sheet: its status, sets done and target. Tapping it jumps there. */
export function ExerciseOverviewRow(props: ExerciseOverviewRowProps) {
  const { tokens } = useAppTheme();
  const { t } = useTranslate();
  const statusLabel = {
    done: t('live_workout.exercise_row.done.label'),
    inProgress: t('live_workout.exercise_row.in_progress.label'),
    notStarted: t('live_workout.exercise_row.not_started.label'),
  }[props.status];

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 14,
        borderWidth: props.isCurrent ? 1.5 : 1,
        borderColor: props.isCurrent ? tokens.accentInk : tokens.line,
        backgroundColor: props.isCurrent ? tokens.wash : props.inSuperset ? tokens.bg : tokens.card,
        overflow: 'hidden',
      }}
    >
      {props.leading}
      <Pressable
        testID={props.testID}
        onPress={props.onPress}
        accessibilityRole="button"
        accessibilityState={{ selected: props.isCurrent }}
        accessibilityLabel={`${props.label}, ${props.name}, ${statusLabel}, ${props.subtitle}`}
        style={({ pressed }) => ({
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing[3],
          minHeight: spacing[16],
          paddingVertical: spacing[2],
          paddingRight: spacing[3],
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <StatusDot label={props.label} status={props.status} />
        <View style={{ flex: 1, gap: spacing[0.5] }}>
          <SurfaceText font="text-base" weight="600" style={{ color: tokens.ink }}>
            {props.name}
          </SurfaceText>
          <SurfaceText font="text-sm" style={{ color: tokens.muted }}>
            {props.subtitle}
          </SurfaceText>
        </View>
        {props.isCurrent ? (
          <View
            style={{
              paddingHorizontal: spacing[2],
              paddingVertical: spacing[0.5],
              borderRadius: 7,
              backgroundColor: tokens.accentSoft,
            }}
          >
            <SurfaceText font="text-xs" weight="700" style={{ color: tokens.accentSoftInk }}>
              {t('live_workout.exercise_row.now.label')}
            </SurfaceText>
          </View>
        ) : null}
      </Pressable>
    </View>
  );
}

/** Done is a filled check, in progress an accent ring round the label, not started a plain ring. */
function StatusDot({ label, status }: { label: string; status: ExerciseStatus }) {
  const { tokens } = useAppTheme();
  return (
    <View
      style={{
        width: DOT_SIZE,
        height: DOT_SIZE,
        borderRadius: DOT_SIZE / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: status === 'done' ? tokens.accent : tokens.bg,
        borderWidth: status === 'done' ? 0 : status === 'inProgress' ? 2 : 1,
        borderColor: status === 'inProgress' ? tokens.accentInk : tokens.line,
      }}
    >
      {status === 'done' ? (
        <MsIconSrc name="check" size={16} color={tokens.onAccent} />
      ) : (
        <SurfaceText font="text-sm" weight="700" style={{ color: tokens.ink }}>
          {label}
        </SurfaceText>
      )}
    </View>
  );
}

/** Heads a superset's rows in the sheet. */
export function SupersetGroupHeader({ label, leading }: { label: string; leading: ReactNode }) {
  const { tokens } = useAppTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[1] }}>
      {leading}
      <MsIconSrc name="swapHoriz" size={14} color={tokens.muted} />
      <SurfaceText
        font="text-xs"
        weight="700"
        style={{ color: tokens.muted, textTransform: 'uppercase', letterSpacing: 0.7 }}
      >
        {label}
      </SurfaceText>
    </View>
  );
}
