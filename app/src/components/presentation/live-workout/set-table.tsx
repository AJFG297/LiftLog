import { MsIconSrc } from '@/components/presentation/foundation/ms-icon-source';
import { SetBadge, type SetBadgeProps } from '@/components/presentation/foundation/set-badge';
import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { SwipeToDelete } from '@/components/presentation/foundation/swipe-to-delete';
import { MIN_TOUCH_TARGET } from '@/components/presentation/foundation/touch-target';
import { font, spacing, useAppTheme } from '@/hooks/useAppTheme';
import { useTranslate } from '@tolgee/react';
import { type Ref, useEffect } from 'react';
import { Pressable, View } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

const COLUMN = { badge: 36, weight: 74, reps: 60, check: MIN_TOUCH_TARGET } as const;
const COLUMN_GAP = spacing[2];
const CELL_RADIUS = 10;

/** A weight or reps field in a set row. */
export interface SetTableCell {
  text: string;
  /** The lifter's own value, typed or logged, in ink; otherwise today's target in the placeholder grey. */
  entered: boolean;
  editing: boolean;
  /** Where the caret sits while editing: before the placeholder, or after what has been typed. */
  caret: 'before' | 'after' | undefined;
  accessibilityLabel: string;
  onPress: () => void;
}

export interface SetTableRow {
  key: string;
  badge: SetBadgeProps;
  badgeAccessibilityLabel: string;
  onPressBadge: () => void;
  previous: string;
  /** Undefined for a movement that tracks no load. */
  weight: SetTableCell | undefined;
  reps: SetTableCell;
  /** "@9", shown on the reps. */
  rpe: string | undefined;
  logged: boolean;
  /** The set to do next, outlined. */
  isNext: boolean;
  checkAccessibilityLabel: string;
  onToggle: () => void;
  /** Swiping the row left deletes it. Undefined for a set that can't go, the exercise's last working set. */
  remove: { accessibilityLabel: string; onRemove: () => void } | undefined;
}

interface SetTableProps {
  /** "kg", "kg each", "lb". */
  weightHeader: string;
  showsWeight: boolean;
  rows: SetTableRow[];
  onAddSet: () => void;
  /** Attached to the row being typed into, so the screen can keep it in view above the number pad. */
  editingRowRef?: Ref<View>;
}

/** The live workout's sets: Set, Previous, weight, Reps and a check, then Add set. */
export function SetTable(props: SetTableProps) {
  const { t } = useTranslate();
  const { tokens } = useAppTheme();
  return (
    <View style={{ gap: spacing[3] }}>
      <View style={{ gap: spacing[1] }}>
        <View
          style={{ flexDirection: 'row', gap: COLUMN_GAP, paddingHorizontal: spacing[0.5] }}
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
        >
          <HeaderText width={COLUMN.badge} align="center">
            {t('live_workout.set_table.set.label')}
          </HeaderText>
          <HeaderText flex>{t('live_workout.set_table.previous.label')}</HeaderText>
          {props.showsWeight ? (
            <HeaderText width={COLUMN.weight} align="center">
              {props.weightHeader}
            </HeaderText>
          ) : null}
          <HeaderText width={COLUMN.reps} align="center">
            {t('live_workout.set_table.reps.label')}
          </HeaderText>
          <View style={{ width: COLUMN.check }} />
        </View>
        {props.rows.map((row) => (
          <SwipeToDelete
            key={row.key}
            onDelete={row.remove?.onRemove}
            label={t('generic.delete.button')}
            accessibilityLabel={row.remove?.accessibilityLabel ?? ''}
            resetKey={props.rows.length}
          >
            <SetTableRowView
              row={row}
              showsWeight={props.showsWeight}
              outlined={row.isNext}
              rowRef={row.weight?.editing || row.reps.editing ? props.editingRowRef : undefined}
            />
          </SwipeToDelete>
        ))}
      </View>
      <Pressable
        testID="add-set"
        accessibilityRole="button"
        onPress={props.onAddSet}
        style={({ pressed }) => ({
          minHeight: MIN_TOUCH_TARGET,
          borderRadius: 12,
          borderWidth: 1,
          borderStyle: 'dashed',
          borderColor: tokens.line3,
          backgroundColor: pressed ? tokens.track : 'transparent',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: spacing[1],
        })}
      >
        <MsIconSrc name="add" size={16} color={tokens.ink} />
        <SurfaceText font="text-sm" weight="600" style={{ color: tokens.ink }}>
          {t('live_workout.add_set.button')}
        </SurfaceText>
      </Pressable>
    </View>
  );
}

function HeaderText(props: { children: string; width?: number; flex?: boolean; align?: 'center' }) {
  const { tokens } = useAppTheme();
  return (
    <SurfaceText
      font="text-2xs"
      weight="600"
      numberOfLines={1}
      style={{
        width: props.width,
        flex: props.flex ? 1 : undefined,
        textAlign: props.align,
        color: tokens.muted,
        textTransform: 'uppercase',
        letterSpacing: 0.6,
      }}
    >
      {props.children}
    </SurfaceText>
  );
}

function SetTableRowView(props: {
  row: SetTableRow;
  showsWeight: boolean;
  outlined: boolean;
  rowRef: Ref<View> | undefined;
}) {
  const { tokens } = useAppTheme();
  const { row } = props;
  return (
    <View
      ref={props.rowRef}
      testID="set-row"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: COLUMN_GAP,
        paddingVertical: spacing[1],
        paddingHorizontal: spacing[0.5],
        borderRadius: 12,
        backgroundColor: row.logged ? tokens.wash : 'transparent',
      }}
    >
      <Pressable
        testID="set-badge"
        accessibilityRole="button"
        accessibilityLabel={row.badgeAccessibilityLabel}
        onPress={row.onPressBadge}
        // Screen readers can't swipe a row away, so deleting is an action on the set's badge.
        accessibilityActions={row.remove ? [{ name: 'delete', label: row.remove.accessibilityLabel }] : undefined}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === 'delete') {
            row.remove?.onRemove();
          }
        }}
        // The 36pt badge column, with a 44pt target that spills into the gaps either side.
        style={{
          width: MIN_TOUCH_TARGET,
          minHeight: MIN_TOUCH_TARGET,
          marginHorizontal: (COLUMN.badge - MIN_TOUCH_TARGET) / 2,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <SetBadge {...row.badge} />
      </Pressable>
      <SurfaceText
        numeric
        font="text-sm"
        numberOfLines={1}
        adjustsFontSizeToFit
        style={{ flex: 1, color: tokens.muted }}
      >
        {row.previous}
      </SurfaceText>
      {props.showsWeight && row.weight ? (
        <EntryCell
          testID="set-weight"
          cell={row.weight}
          width={COLUMN.weight}
          logged={row.logged}
          outlined={props.outlined}
        />
      ) : props.showsWeight ? (
        <View style={{ width: COLUMN.weight }} />
      ) : null}
      <EntryCell
        testID="set-reps"
        cell={row.reps}
        width={COLUMN.reps}
        logged={row.logged}
        outlined={props.outlined}
        rpe={row.rpe}
      />
      <CheckButton logged={row.logged} accessibilityLabel={row.checkAccessibilityLabel} onPress={row.onToggle} />
    </View>
  );
}

function EntryCell(props: {
  testID: string;
  cell: SetTableCell;
  width: number;
  logged: boolean;
  outlined: boolean;
  rpe?: string;
}) {
  const { tokens } = useAppTheme();
  const { cell } = props;
  const border = cell.editing
    ? { borderWidth: 2, borderColor: tokens.accentInk }
    : props.outlined
      ? { borderWidth: 1.5, borderColor: tokens.accentLine2 }
      : { borderWidth: 1, borderColor: 'transparent' };
  return (
    <Pressable
      testID={props.testID}
      accessibilityRole="button"
      accessibilityLabel={cell.accessibilityLabel}
      accessibilityState={{ selected: cell.editing }}
      onPress={cell.onPress}
      style={{
        width: props.width,
        minHeight: MIN_TOUCH_TARGET,
        borderRadius: CELL_RADIUS,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: spacing[1],
        backgroundColor: cell.editing ? tokens.card : props.logged ? 'transparent' : tokens.bg,
        ...border,
      }}
    >
      {cell.caret === 'before' ? <Caret /> : null}
      <SurfaceText
        numeric
        numberOfLines={1}
        adjustsFontSizeToFit
        maxFontSizeMultiplier={1.4}
        style={{
          ...font['text-lg'],
          flexShrink: 1,
          color: cell.entered ? tokens.ink : tokens.placeholder,
          fontWeight: cell.entered ? '600' : '500',
        }}
      >
        {cell.text}
      </SurfaceText>
      {cell.caret === 'after' ? <Caret /> : null}
      {props.rpe ? <RpeBadge text={props.rpe} /> : null}
    </Pressable>
  );
}

function RpeBadge(props: { text: string }) {
  const { tokens } = useAppTheme();
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: -7,
        right: -8,
        minHeight: 18,
        paddingHorizontal: 5,
        borderRadius: 9,
        justifyContent: 'center',
        backgroundColor: tokens.ink,
      }}
    >
      <SurfaceText font="text-2xs" weight="700" maxFontSizeMultiplier={1.2} style={{ color: tokens.bg }}>
        {props.text}
      </SurfaceText>
    </View>
  );
}

function CheckButton(props: { logged: boolean; accessibilityLabel: string; onPress: () => void }) {
  const { tokens } = useAppTheme();
  return (
    <Pressable
      testID="set-check"
      accessibilityRole="button"
      accessibilityLabel={props.accessibilityLabel}
      onPress={props.onPress}
      style={({ pressed }) => ({
        width: COLUMN.check,
        height: COLUMN.check,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: props.logged ? tokens.accent : pressed ? tokens.track : tokens.card,
        borderWidth: props.logged ? 0 : 1.5,
        borderColor: tokens.line2,
      })}
    >
      <MsIconSrc name="check" size={22} color={props.logged ? tokens.onAccent : tokens.line2} />
    </Pressable>
  );
}

/** The typing caret: blinks, or holds still when the system asks for less motion. */
function Caret() {
  const { tokens } = useAppTheme();
  const reduceMotion = useReducedMotion();
  const opacity = useSharedValue(1);
  useEffect(() => {
    if (reduceMotion) {
      return;
    }
    opacity.value = withRepeat(
      withSequence(withDelay(500, withTiming(0, { duration: 0 })), withDelay(500, withTiming(1, { duration: 0 }))),
      -1,
    );
    return () => cancelAnimation(opacity);
  }, [opacity, reduceMotion]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View
      style={[{ width: 2, height: 20, marginHorizontal: 1, borderRadius: 1, backgroundColor: tokens.accentInk }, style]}
    />
  );
}
