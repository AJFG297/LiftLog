import { MsIconSrc } from '@/components/presentation/foundation/ms-icon-source';
import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { spacing, useAppTheme } from '@/hooks/useAppTheme';
import { Pressable, View } from 'react-native';

const ORDER_SIZE = 28;

interface ExercisePickerRowProps {
  name: string;
  /** "Shoulders · Dumbbell · already in Push". */
  meta: string;
  /** Picking many: the row's place in tap order, or undefined while it isn't picked. Picking one: leave out. */
  order?: number | undefined;
  multiSelect: boolean;
  /** Read out with the order, e.g. "Number 2". */
  orderLabel?: string;
  onPress: () => void;
  testID?: string;
}

/** One exercise in the picker. Picked, it takes the wash and shows its number in tap order. */
export function ExercisePickerRow({
  name,
  meta,
  order,
  multiSelect,
  orderLabel,
  onPress,
  testID,
}: ExercisePickerRowProps) {
  const { tokens } = useAppTheme();
  const picked = order !== undefined;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole={multiSelect ? 'togglebutton' : 'button'}
      accessibilityState={multiSelect ? { checked: picked } : undefined}
      accessibilityLabel={meta ? `${name}, ${meta}` : name}
      accessibilityValue={picked && orderLabel ? { text: orderLabel } : undefined}
    >
      {({ pressed }) => (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing[3],
            minHeight: 60,
            paddingVertical: 10,
            paddingLeft: 14,
            paddingRight: spacing[3],
            borderRadius: 14,
            borderWidth: picked ? 1.5 : 1,
            borderColor: picked ? tokens.accentInk : tokens.line,
            backgroundColor: picked ? tokens.wash : pressed ? tokens.track : tokens.card,
          }}
        >
          <View style={{ flex: 1, minWidth: 0, gap: spacing[0.5] }}>
            <SurfaceText font="text-base" weight="600" style={{ color: tokens.ink }}>
              {name}
            </SurfaceText>
            {meta ? (
              <SurfaceText font="text-sm" style={{ color: tokens.muted }}>
                {meta}
              </SurfaceText>
            ) : null}
          </View>
          {multiSelect ? (
            <View
              style={{
                width: ORDER_SIZE,
                height: ORDER_SIZE,
                borderRadius: ORDER_SIZE / 2,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: picked ? tokens.accent : undefined,
                borderWidth: picked ? 0 : 2,
                borderColor: tokens.line3,
              }}
            >
              {picked ? (
                <SurfaceText font="text-sm" numeric weight="600" style={{ color: tokens.onAccent }}>
                  {order}
                </SurfaceText>
              ) : null}
            </View>
          ) : null}
        </View>
      )}
    </Pressable>
  );
}

/** "RECENT", "ALL EXERCISES", "MATCHES" or a muscle, over its rows. */
export function ExercisePickerSectionHeader({ label }: { label: string }) {
  const { tokens } = useAppTheme();
  return (
    <SurfaceText
      font="text-xs"
      weight="700"
      accessibilityRole="header"
      style={{
        color: tokens.muted,
        textTransform: 'uppercase',
        letterSpacing: 0.7,
        paddingTop: 10,
        paddingBottom: spacing[1],
        paddingHorizontal: spacing[1],
      }}
    >
      {label}
    </SurfaceText>
  );
}

/** Offers the search as a new exercise, after matches that are close but not exact. */
export function ExercisePickerCreateRow({ label, onPress }: { label: string; onPress: () => void }) {
  const { tokens } = useAppTheme();
  return (
    <Pressable testID="exercise-picker-create-row" onPress={onPress} accessibilityRole="button">
      {({ pressed }) => (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing[2],
            minHeight: 54,
            paddingHorizontal: 14,
            borderRadius: 14,
            borderWidth: 1.5,
            borderStyle: 'dashed',
            borderColor: tokens.line3,
            backgroundColor: pressed ? tokens.track : undefined,
          }}
        >
          <MsIconSrc name="add" size={20} color={tokens.accentInk} />
          <SurfaceText font="text-base" weight="600" style={{ flex: 1, color: tokens.accentInk }}>
            {label}
          </SurfaceText>
        </View>
      )}
    </Pressable>
  );
}

interface ExercisePickerNoMatchProps {
  title: string;
  body: string;
  createLabel: string;
  onCreate: () => void;
}

/** 'No exercise called "X"' with a way to make it. */
export function ExercisePickerNoMatch({ title, body, createLabel, onCreate }: ExercisePickerNoMatchProps) {
  const { tokens } = useAppTheme();
  return (
    <View style={{ alignItems: 'center', gap: 10, paddingVertical: spacing[8], paddingHorizontal: spacing[3] }}>
      <SurfaceText font="text-base" weight="600" style={{ color: tokens.ink, textAlign: 'center' }}>
        {title}
      </SurfaceText>
      <SurfaceText font="text-sm" style={{ color: tokens.muted, textAlign: 'center' }}>
        {body}
      </SurfaceText>
      <Pressable testID="exercise-picker-create" onPress={onCreate} accessibilityRole="button">
        {({ pressed }) => (
          <View
            style={{
              minHeight: 46,
              paddingHorizontal: 18,
              borderRadius: 14,
              justifyContent: 'center',
              backgroundColor: tokens.ink,
              opacity: pressed ? 0.85 : 1,
            }}
          >
            <SurfaceText font="text-base" weight="600" style={{ color: tokens.bg }}>
              {createLabel}
            </SurfaceText>
          </View>
        )}
      </Pressable>
    </View>
  );
}
