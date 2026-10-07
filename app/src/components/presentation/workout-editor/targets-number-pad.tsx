import { NumberPadKey, NumberPadKeyIcon } from '@/components/presentation/foundation/number-pad/number-pad-key';
import { haptics } from '@/components/presentation/foundation/haptics';
import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { MIN_TOUCH_TARGET } from '@/components/presentation/foundation/touch-target';
import { spacing, useAppTheme } from '@/hooks/useAppTheme';
import { useTranslate } from '@tolgee/react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { ReduceMotion, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** One piece of the pad's display: a value, a separator such as the range's "–", or a unit. */
export interface TargetsPadDisplayPart {
  text: string;
  /** A unit ("min", "km") is set smaller and muted. */
  unit?: boolean;
  /** A separator, such as the range's "–", is muted. */
  separator?: boolean;
  /** For a value that can be tapped to edit it instead, such as an end of a range. */
  pick?: { active: boolean; accessibilityLabel: string; onPress: () => void };
}

export interface TargetsPadChip {
  label: string;
  selected: boolean;
  accessibilityLabel: string;
  onPress: () => void;
}

/** The key left of 0: the range's "–", a decimal point, or nothing. */
export interface TargetsPadThirdKey {
  label: string;
  accessibilityLabel: string;
  enabled: boolean;
  onPress: () => void;
}

export interface TargetsNumberPadProps {
  /** What is being edited: "Sets", "Reps · bottom of range". */
  label: string;
  display: TargetsPadDisplayPart[];
  chips: TargetsPadChip[];
  thirdKey: TargetsPadThirdKey | undefined;
  onDigit: (digit: number) => void;
  onBackspace: () => void;
  onStep: (by: 1 | -1) => void;
  /** Read out for − and +, when a step is not one, such as a distance's 0.5. */
  stepLabels?: { minus: string; plus: string };
  /** "Next: Reps", "Next: Set 3", "Next: Rest". Without one, Done takes the whole row. */
  next?: { label: string; onPress: () => void };
  onDone: () => void;
}

const DIGIT_ROWS = [
  [1, 2, 3],
  [4, 5, 6],
  [7, 8, 9],
];

/**
 * The edit exercise sheet's number pad (D8, PM-45): what is being edited with its value, − / +, common
 * values, the digits, then Next and Done. Presentational: the weighted and the cardio targets drive it.
 */
export function TargetsNumberPad(props: TargetsNumberPadProps) {
  const { tokens } = useAppTheme();
  const { t } = useTranslate();
  const insets = useSafeAreaInsets();

  const digitKey = (digit: number) => (
    <NumberPadKey key={digit} label={String(digit)} onPress={() => props.onDigit(digit)}>
      <SurfaceText numeric font="text-2xl" style={{ color: tokens.ink }}>
        {digit}
      </SurfaceText>
    </NumberPadKey>
  );

  return (
    <Animated.View
      testID="targets-number-pad"
      accessibilityLabel={t('exercise_editor.pad.label')}
      entering={SlideInDown.duration(200).reduceMotion(ReduceMotion.System)}
      exiting={SlideOutDown.duration(160).reduceMotion(ReduceMotion.System)}
      style={{
        backgroundColor: tokens.keypad,
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderColor: tokens.line,
        paddingTop: spacing[4],
        paddingHorizontal: spacing[4],
        paddingBottom: spacing[4] + insets.bottom,
        gap: 14,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing[3] }}>
        <View style={{ flexShrink: 1, gap: spacing[0.5] }}>
          <SurfaceText font="text-sm" style={{ color: tokens.muted }}>
            {props.label}
          </SurfaceText>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[1] }}>
            {props.display.map((part, index) => (
              <DisplayPart key={index} part={part} />
            ))}
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: spacing[2] }}>
          <StepKey
            text="−"
            label={props.stepLabels?.minus ?? t('exercise_editor.pad.minus.accessibility_label')}
            onPress={() => props.onStep(-1)}
          />
          <StepKey
            text="+"
            label={props.stepLabels?.plus ?? t('exercise_editor.pad.plus.accessibility_label')}
            onPress={() => props.onStep(1)}
          />
        </View>
      </View>

      {props.chips.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ gap: spacing[2] }}
        >
          {props.chips.map((chip) => (
            <ValueChip key={chip.label} chip={chip} />
          ))}
        </ScrollView>
      ) : null}

      <View style={{ gap: spacing[2] }}>
        {DIGIT_ROWS.map((row) => (
          <View key={row.join('')} style={{ flexDirection: 'row', gap: spacing[2] }}>
            {row.map(digitKey)}
          </View>
        ))}
        <View style={{ flexDirection: 'row', gap: spacing[2] }}>
          {props.thirdKey ? (
            <ThirdKey thirdKey={props.thirdKey} />
          ) : (
            <View style={{ flex: 1 }} importantForAccessibility="no" accessibilityElementsHidden />
          )}
          {digitKey(0)}
          <NumberPadKey label={t('number_pad.delete.button')} onPress={props.onBackspace}>
            <NumberPadKeyIcon name="backspace" color={tokens.ink} />
          </NumberPadKey>
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: spacing[2] }}>
        {props.next ? (
          <ActionKey testID="targets-pad-next" label={props.next.label} onPress={props.next.onPress} />
        ) : null}
        <ActionKey
          testID="targets-pad-done"
          label={t('exercise_editor.pad.done.button')}
          onPress={props.onDone}
          filled
        />
      </View>
    </Animated.View>
  );
}

const VALUE_FONT = 'text-3xl';

function DisplayPart({ part }: { part: TargetsPadDisplayPart }) {
  const { tokens } = useAppTheme();
  if (part.unit) {
    return (
      <SurfaceText font="text-lg" style={{ color: tokens.muted }}>
        {part.text}
      </SurfaceText>
    );
  }
  const { pick } = part;
  if (!pick) {
    return (
      <SurfaceText numeric font={VALUE_FONT} weight="500" style={{ color: part.separator ? tokens.muted : tokens.ink }}>
        {part.text}
      </SurfaceText>
    );
  }
  return (
    <Pressable
      onPress={pick.onPress}
      accessibilityRole="button"
      accessibilityLabel={pick.accessibilityLabel}
      accessibilityState={{ selected: pick.active }}
      style={{
        minWidth: 52,
        minHeight: 52,
        paddingHorizontal: spacing[2],
        borderRadius: 10,
        borderWidth: 2,
        alignItems: 'center',
        justifyContent: 'center',
        borderColor: pick.active ? tokens.accent : 'transparent',
        backgroundColor: pick.active ? tokens.accentSoft : 'transparent',
      }}
    >
      <SurfaceText
        numeric
        font={VALUE_FONT}
        weight="500"
        style={{ color: pick.active ? tokens.accentSoftInk : tokens.muted }}
      >
        {part.text}
      </SurfaceText>
    </Pressable>
  );
}

function StepKey({ text, label, onPress }: { text: string; label: string; onPress: () => void }) {
  const { tokens } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        width: 48,
        height: 48,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: tokens.line,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed ? tokens.track : tokens.keypadKey,
      })}
    >
      <SurfaceText numeric font="text-xl" style={{ color: tokens.ink }}>
        {text}
      </SurfaceText>
    </Pressable>
  );
}

function ValueChip({ chip }: { chip: TargetsPadChip }) {
  const { tokens } = useAppTheme();
  return (
    <Pressable
      onPress={() => {
        haptics.selection();
        chip.onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={chip.accessibilityLabel}
      accessibilityState={{ selected: chip.selected }}
      style={{ minHeight: MIN_TOUCH_TARGET, justifyContent: 'center' }}
    >
      {({ pressed }) => (
        <View
          style={{
            height: 32,
            paddingHorizontal: spacing[3],
            borderRadius: 16,
            borderWidth: 1,
            justifyContent: 'center',
            borderColor: chip.selected ? tokens.accent : tokens.line,
            backgroundColor: chip.selected ? tokens.accentSoft : pressed ? tokens.track : tokens.card,
          }}
        >
          <SurfaceText numeric font="text-sm" style={{ color: chip.selected ? tokens.accentSoftInk : tokens.ink }}>
            {chip.label}
          </SurfaceText>
        </View>
      )}
    </Pressable>
  );
}

function ThirdKey({ thirdKey }: { thirdKey: TargetsPadThirdKey }) {
  const { tokens } = useAppTheme();
  return (
    <View style={{ flex: 1, opacity: thirdKey.enabled ? 1 : 0.3 }}>
      <NumberPadKey label={thirdKey.accessibilityLabel} onPress={thirdKey.enabled ? thirdKey.onPress : () => {}}>
        <SurfaceText numeric font="text-2xl" style={{ color: tokens.ink }}>
          {thirdKey.label}
        </SurfaceText>
      </NumberPadKey>
    </View>
  );
}

function ActionKey(props: { label: string; onPress: () => void; filled?: boolean; testID: string }) {
  const { tokens } = useAppTheme();
  return (
    <Pressable
      testID={props.testID}
      onPress={props.onPress}
      accessibilityRole="button"
      accessibilityLabel={props.label}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: 48,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: props.filled ? 0 : 1,
        borderColor: tokens.line,
        backgroundColor: props.filled ? tokens.ink : tokens.card,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <SurfaceText
        font="text-base"
        weight={props.filled ? '600' : '500'}
        numberOfLines={1}
        style={{ color: props.filled ? tokens.bg : tokens.ink }}
      >
        {props.label}
      </SurfaceText>
    </Pressable>
  );
}
