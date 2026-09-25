import { PotentialSet } from '@/models/session-models';
import { formatRepsTarget, Resistance, RepsTarget } from '@/models/blueprint-models';
import { ReactNode } from 'react';
import { Text, View } from 'react-native';
import WeightFormat from '@/components/presentation/foundation/weight-format';
import { font, rounding, spacing, useAppTheme } from '@/hooks/useAppTheme';
import TouchableRipple from '@/components/presentation/foundation/touchable-ripple';
import Icon from '@/components/presentation/foundation/icon';
import { formatRpe, Rpe } from '@/models/session-models/rpe';

export type PotentialSetSize = 'default' | 'compact';

interface PotentialSetDisplayProps {
  set: PotentialSet;
  repsTarget: RepsTarget;
  resistance: Resistance;
  previousRepCount?: number | undefined;
  size?: PotentialSetSize;
  /** Renders the RPE row. A list shows it on every tile once any has one, so the tiles stay level. */
  showRpe?: boolean;
  rpe?: Rpe | undefined;

  /** Omit to render a static tile - a tile with no handler mounts no gesture detector at all. */
  onPressReps?: () => void;
  onPressWeight?: () => void;
  onPressRpe?: () => void;
}

const metrics = {
  default: {
    repsHeight: spacing[15],
    minWidth: spacing[15],
    maxWidth: undefined,
    repsFont: font['text-xl'],
    targetFont: font['text-sm'],
    footerFont: font['text-sm'],
    footerPadding: spacing[2],
  },
  compact: {
    repsHeight: spacing[9],
    minWidth: spacing[11],
    maxWidth: spacing[16],
    repsFont: font['text-lg'],
    targetFont: font['text-xs'],
    footerFont: font['text-xs'],
    footerPadding: spacing[1],
  },
} as const;

/**
 * The two-tone set tile, without any of the editor's interactivity. Handlers are optional so a read-only
 * list can render many of these without paying for a `TouchableRipple` -- and its gesture detector -- per
 * tile.
 */
export function PotentialSetDisplay(props: PotentialSetDisplayProps) {
  const { colors } = useAppTheme();
  const size = metrics[props.size ?? 'default'];
  const repCountValue = props.set.set?.repsCompleted;
  const isFilled = repCountValue !== undefined;
  const showsWeight = props.resistance !== 'none';
  const showsRpe = !!props.showRpe;
  const hasFooter = showsWeight || showsRpe;

  return (
    <View
      style={{
        userSelect: 'none',
        minWidth: size.minWidth,
        maxWidth: size.maxWidth,
        flexGrow: size.maxWidth === undefined ? undefined : 1,
        flexBasis: size.maxWidth === undefined ? undefined : size.minWidth,
      }}
    >
      <View
        style={{
          borderRadius: rounding.roundedRectangleRadius,
          // The weight or RPE row closes the tile off when there is one.
          borderBottomLeftRadius: hasFooter ? 0 : rounding.roundedRectangleRadius,
          borderBottomRightRadius: hasFooter ? 0 : rounding.roundedRectangleRadius,
          overflow: 'hidden',
        }}
      >
        <Pressable
          onPress={props.onPressReps}
          testID="repcount"
          style={{
            flexShrink: 0,
            height: size.repsHeight,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: isFilled ? colors.primary : colors.secondaryContainer,
          }}
        >
          <View style={{ alignItems: 'center' }}>
            <Text
              style={{
                color: isFilled ? colors.onPrimary : colors.onSecondaryContainer,
                ...size.repsFont,
              }}
            >
              <Text style={{ fontWeight: 'bold' }}>{repCountValue ?? '-'}</Text>
              <Text style={{ ...size.targetFont, verticalAlign: 'top' }}>/{formatRepsTarget(props.repsTarget)}</Text>
            </Text>
            {!isFilled && props.previousRepCount !== undefined && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[0.5] }}>
                <Icon source={'history'} size={12} color={colors.onSecondaryContainer + '99'} />
                <Text style={{ color: colors.onSecondaryContainer + '99' }}>{props.previousRepCount}</Text>
              </View>
            )}
          </View>
        </Pressable>
      </View>
      {showsWeight && (
        <FooterRow
          onPress={props.onPressWeight}
          testID="repcount-weight"
          padding={size.footerPadding}
          isLast={!showsRpe}
        >
          <Text style={{ color: colors.onSurface, ...size.footerFont }}>
            <WeightFormat weight={props.set.weight} usesBodyweight={props.resistance === 'bodyweight'} />
          </Text>
        </FooterRow>
      )}
      {showsRpe && (
        <FooterRow onPress={props.onPressRpe} testID="repcount-rpe" padding={size.footerPadding} isLast>
          <Text
            style={{
              color: props.rpe === undefined ? colors.onSurfaceVariant : colors.onSurface,
              ...size.footerFont,
            }}
          >
            {props.rpe === undefined ? '@–' : formatRpe(props.rpe)}
          </Text>
        </FooterRow>
      )}
    </View>
  );
}

/** A row under the reps (weight, RPE). The last one rounds off the bottom of the tile. */
function FooterRow(props: {
  onPress: (() => void) | undefined;
  testID: string;
  padding: number;
  isLast: boolean;
  children: ReactNode;
}) {
  const { colors } = useAppTheme();
  const bottomRadius = props.isLast ? rounding.roundedRectangleRadius : 0;
  return (
    <View
      style={{
        borderTopWidth: 1,
        borderColor: colors.outline,
        backgroundColor: colors.surfaceContainerHigh,
        borderBottomLeftRadius: bottomRadius,
        borderBottomRightRadius: bottomRadius,
        overflow: 'hidden',
        padding: props.padding,
        width: '100%',
      }}
    >
      <Pressable
        onPress={props.onPress}
        testID={props.testID}
        style={{
          alignItems: 'center',
          // Stretch the touch target over the row's padding.
          margin: -props.padding,
          padding: props.padding,
        }}
      >
        {props.children}
      </Pressable>
    </View>
  );
}

function Pressable(props: { onPress: (() => void) | undefined; style: object; testID: string; children: ReactNode }) {
  if (!props.onPress) {
    return (
      <View style={props.style} testID={props.testID}>
        {props.children}
      </View>
    );
  }
  return (
    <TouchableRipple style={props.style} onPress={props.onPress} testID={props.testID}>
      {props.children}
    </TouchableRipple>
  );
}
