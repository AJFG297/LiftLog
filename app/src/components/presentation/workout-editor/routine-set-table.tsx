import { MsIconSrc } from '@/components/presentation/foundation/ms-icon-source';
import { SetBadge, type SetBadgeProps } from '@/components/presentation/foundation/set-badge';
import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { MIN_TOUCH_TARGET } from '@/components/presentation/foundation/touch-target';
import { spacing, useAppTheme } from '@/hooks/useAppTheme';
import { type Ref } from 'react';
import { Pressable, View } from 'react-native';

const CELL_HEIGHT = 44;
const BADGE_COLUMN = MIN_TOUCH_TARGET;
const REMOVE_COLUMN = MIN_TOUCH_TARGET;

export interface RoutineSetCell {
  text: string;
  /** Read out for the cell, e.g. "Reps, set 2, 5". */
  accessibilityLabel: string;
  /** A cell without `onPress` shows a value the routine doesn't plan, such as the weight a set carries over. */
  onPress?: () => void;
  editing?: boolean;
  /** Drawn in the placeholder colour: shown for information, not set here. */
  muted?: boolean;
}

export interface RoutineSetTableRow {
  key: string;
  badge: SetBadgeProps;
  /** What the badge button does, read out: "Set 2, working set. Change set type". */
  badgeAccessibilityLabel: string;
  onPickType: () => void;
  weight: RoutineSetCell;
  reps: RoutineSetCell;
  removeAccessibilityLabel: string;
  /** Undefined when the set can't go, as the last working set can't. */
  onRemove: (() => void) | undefined;
}

interface RoutineSetTableProps {
  headers: { set: string; weight: string; reps: string };
  rows: RoutineSetTableRow[];
  addSetLabel: string;
  onAddSet: () => void;
  /** A line under the table, such as where the weights come from. */
  note?: string;
  /** Attached to the row with a cell being edited, so the screen can keep it above the number pad. */
  editingRowRef?: Ref<View>;
}

/** The routine editor's set rows: a set-type badge, weight and reps cells that open the number pad, and remove. */
export function RoutineSetTable(props: RoutineSetTableProps) {
  const { tokens } = useAppTheme();
  return (
    <View style={{ gap: spacing[2] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }} importantForAccessibility="no">
        <HeaderText width={BADGE_COLUMN}>{props.headers.set}</HeaderText>
        <HeaderText flex>{props.headers.weight}</HeaderText>
        <HeaderText flex>{props.headers.reps}</HeaderText>
        <View style={{ width: REMOVE_COLUMN }} />
      </View>
      {props.rows.map((row) => {
        const editing = row.weight.editing || row.reps.editing;
        return (
          <View
            key={row.key}
            ref={editing ? props.editingRowRef : undefined}
            style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}
          >
            <Pressable
              onPress={row.onPickType}
              accessibilityRole="button"
              accessibilityLabel={row.badgeAccessibilityLabel}
              style={{ width: BADGE_COLUMN, height: MIN_TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' }}
            >
              <SetBadge {...row.badge} />
            </Pressable>
            <Cell cell={row.weight} />
            <Cell cell={row.reps} />
            <Pressable
              onPress={row.onRemove}
              disabled={!row.onRemove}
              accessibilityRole="button"
              accessibilityLabel={row.removeAccessibilityLabel}
              accessibilityState={{ disabled: !row.onRemove }}
              style={{ width: REMOVE_COLUMN, height: MIN_TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' }}
            >
              <MsIconSrc name="close" size={18} color={row.onRemove ? tokens.muted : tokens.line3} />
            </Pressable>
          </View>
        );
      })}
      {props.note ? (
        <SurfaceText font="text-xs" style={{ color: tokens.muted }}>
          {props.note}
        </SurfaceText>
      ) : null}
      <Pressable
        onPress={props.onAddSet}
        accessibilityRole="button"
        style={({ pressed }) => ({
          minHeight: MIN_TOUCH_TARGET,
          borderRadius: 12,
          borderWidth: 1,
          borderStyle: 'dashed',
          borderColor: tokens.line3,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: spacing[1],
          backgroundColor: pressed ? tokens.track : undefined,
        })}
      >
        <MsIconSrc name="add" size={18} color={tokens.ink} />
        <SurfaceText font="text-sm" weight="600" style={{ color: tokens.ink }}>
          {props.addSetLabel}
        </SurfaceText>
      </Pressable>
    </View>
  );
}

function HeaderText(props: { children: string; width?: number; flex?: boolean }) {
  const { tokens } = useAppTheme();
  return (
    <SurfaceText
      font="text-xs"
      weight="600"
      numberOfLines={1}
      style={{
        width: props.width,
        flex: props.flex ? 1 : undefined,
        textAlign: 'center',
        color: tokens.muted,
        textTransform: 'uppercase',
        letterSpacing: 0.7,
      }}
    >
      {props.children}
    </SurfaceText>
  );
}

function Cell({ cell }: { cell: RoutineSetCell }) {
  const { tokens } = useAppTheme();
  const body = (
    <SurfaceText
      numeric
      font="text-base"
      weight="600"
      numberOfLines={1}
      style={{ color: cell.muted ? tokens.placeholder : tokens.ink }}
    >
      {cell.text}
    </SurfaceText>
  );
  const look = {
    flex: 1,
    minHeight: CELL_HEIGHT,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: cell.editing ? tokens.accentInk : 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  } as const;
  if (!cell.onPress) {
    return (
      <View accessible accessibilityLabel={cell.accessibilityLabel} style={look}>
        {body}
      </View>
    );
  }
  return (
    <Pressable
      onPress={cell.onPress}
      accessibilityRole="button"
      accessibilityLabel={cell.accessibilityLabel}
      accessibilityState={{ selected: !!cell.editing }}
      style={({ pressed }) => [look, { backgroundColor: pressed ? tokens.track : tokens.bg }]}
    >
      {body}
    </Pressable>
  );
}
