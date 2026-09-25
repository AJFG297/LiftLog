import { PotentialSet } from '@/models/session-models';
import { formatRepsTarget, Resistance, RepsTarget } from '@/models/blueprint-models';
import { ReactNode } from 'react';
import { Text, View } from 'react-native';
import WeightFormat, { formatWeightText } from '@/components/presentation/foundation/weight-format';
import { font, rounding, spacing, useAppTheme } from '@/hooks/useAppTheme';
import TouchableRipple from '@/components/presentation/foundation/touchable-ripple';
import Icon from '@/components/presentation/foundation/icon';
import { formatRpe, Rpe } from '@/models/session-models/rpe';
import { WarmupTile } from '@/components/presentation/workout/weighted/warmup-tile';
import { WarmupBadge } from '@/components/presentation/workout/warmup-badge';
import { useTranslate } from '@tolgee/react';

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
  warmup?: WarmupTile | undefined;

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
  const { t } = useTranslate();
  const size = metrics[props.size ?? 'default'];
  const repCountValue = props.set.set?.repsCompleted;
  const isFilled = repCountValue !== undefined;
  const { warmup } = props;
  const showsWeight = props.resistance !== 'none';
  const showsRpe = !!props.showRpe && !warmup;
  const hasFooter = showsWeight || showsRpe;
  // Warm-ups take the quieter container tones so the working sets keep the eye.
  const repsBackground = warmup
    ? isFilled
      ? colors.primaryContainer
      : colors.surfaceContainerHighest
    : isFilled
      ? colors.primary
      : colors.secondaryContainer;
  const repsColor = warmup
    ? isFilled
      ? colors.onPrimaryContainer
      : colors.onSurfaceVariant
    : isFilled
      ? colors.onPrimary
      : colors.onSecondaryContainer;
  const hintColor = repsColor + '99';
  const previousHint = warmup
    ? warmup.previous &&
      (warmup.previous.weight
        ? t('workout.warmup_set.previous.label', {
            reps: warmup.previous.reps,
            weight: formatWeightText(
              warmup.previous.weight,
              props.resistance === 'bodyweight',
              t('exercise.short_bodyweight.label'),
            ),
          })
        : `${warmup.previous.reps}`)
    : props.previousRepCount?.toString();

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
          testID={warmup ? 'warmup-repcount' : 'repcount'}
          style={{
            flexShrink: 0,
            height: size.repsHeight,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: repsBackground,
          }}
        >
          <View style={{ alignItems: 'center' }}>
            <Text
              style={{
                color: repsColor,
                ...size.repsFont,
              }}
            >
              <Text style={{ fontWeight: 'bold' }}>{repCountValue ?? '-'}</Text>
              <Text style={{ ...size.targetFont, verticalAlign: 'top' }}>/{formatRepsTarget(props.repsTarget)}</Text>
            </Text>
            {!isFilled && previousHint !== undefined && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[0.5] }}>
                <Icon source={'history'} size={12} color={hintColor} />
                <Text style={{ color: hintColor, ...(warmup ? font['text-xs'] : undefined) }}>{previousHint}</Text>
              </View>
            )}
          </View>
        </Pressable>
        {/* Over the reps rather than inside them: a ripple takes exactly one child. */}
        {warmup && <WarmupBadge size="small" style={{ position: 'absolute', top: spacing[0.5], left: spacing[0.5] }} />}
      </View>
      {showsWeight && (
        <FooterRow
          onPress={props.onPressWeight}
          testID={warmup ? 'warmup-repcount-weight' : 'repcount-weight'}
          padding={size.footerPadding}
          isLast={!showsRpe}
        >
          {/* One child: the row's ripple takes exactly one, and an absent label still counts as one. */}
          <View style={{ alignItems: 'center' }}>
            <Text style={{ ...size.footerFont }}>
              <WeightFormat
                weight={props.set.weight}
                usesBodyweight={props.resistance === 'bodyweight'}
                color={warmup ? 'onSurfaceVariant' : 'onSurface'}
              />
            </Text>
            {warmup?.percent !== undefined && (
              <Text style={{ color: colors.onSurfaceVariant, ...font['text-2xs'] }}>
                {t('workout.warmup_set.percent.label', { percent: warmup.percent })}
              </Text>
            )}
          </View>
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
