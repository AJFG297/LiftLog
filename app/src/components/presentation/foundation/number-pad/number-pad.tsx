import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { formatWeightText } from '@/components/presentation/foundation/weight-format';
import { spacing, useAppTheme } from '@/hooks/useAppTheme';
import { type LoadUnit, Weight } from '@/models/weight';
import { localeDecimalSeparator, localeFormatBigNumber } from '@/utils/locale-bignumber';
import { useTranslate } from '@tolgee/react';
import { View } from 'react-native';
import Animated, { ReduceMotion, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NumberPadAccessory } from './number-pad-accessory';
import { NumberPadAccessoryRow } from './number-pad-accessory-row';
import { type Digit, type NumberPadAction, type NumberPadBuffer, numberPadValue } from './number-pad-buffer';
import { NumberPadKey, NumberPadKeyIcon, NumberPadKeySpacer } from './number-pad-key';

export interface NumberPadProps {
  visible: boolean;
  buffer: NumberPadBuffer;
  onAction: (action: NumberPadAction) => void;
  /** The weight's unit, or undefined for a count such as reps. */
  unit: LoadUnit | undefined;
  accessory: NumberPadAccessory | undefined;
  primary: 'next' | 'log';
  onPrimary: () => void;
  onHide: () => void;
}

const DIGIT_ROWS: Digit[][] = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
];

export function NumberPad(props: NumberPadProps) {
  const { tokens } = useAppTheme();
  const { t } = useTranslate();
  const insets = useSafeAreaInsets();
  if (!props.visible) {
    return null;
  }

  const { buffer, onAction } = props;
  const step = props.unit ? formatWeightText(new Weight(buffer.step, props.unit)) : localeFormatBigNumber(buffer.step);
  const digitKey = (digit: Digit) => (
    <NumberPadKey key={digit} label={digit} onPress={() => onAction({ type: 'digit', digit })}>
      <SurfaceText numeric font="text-2xl" style={{ color: tokens.ink }}>
        {digit}
      </SurfaceText>
    </NumberPadKey>
  );

  return (
    <Animated.View
      entering={SlideInDown.duration(200).reduceMotion(ReduceMotion.System)}
      exiting={SlideOutDown.duration(160).reduceMotion(ReduceMotion.System)}
      style={{
        backgroundColor: tokens.keypad,
        paddingHorizontal: spacing[2],
        paddingBottom: spacing[2] + insets.bottom,
        gap: spacing[1],
      }}
    >
      <View style={{ paddingHorizontal: spacing[2] }}>
        <NumberPadAccessoryRow accessory={props.accessory} value={numberPadValue(buffer)} />
      </View>
      <View style={{ flexDirection: 'row', gap: spacing[2] }}>
        <View style={{ flex: 3, gap: spacing[2] }}>
          {DIGIT_ROWS.map((row) => (
            <View key={row.join('')} style={{ flexDirection: 'row', gap: spacing[2] }}>
              {row.map(digitKey)}
            </View>
          ))}
          <View style={{ flexDirection: 'row', gap: spacing[2] }}>
            {buffer.allowDecimal ? (
              <NumberPadKey label={t('number_pad.decimal.button')} onPress={() => onAction({ type: 'decimal' })}>
                <SurfaceText numeric font="text-2xl" style={{ color: tokens.ink }}>
                  {localeDecimalSeparator()}
                </SurfaceText>
              </NumberPadKey>
            ) : (
              <NumberPadKeySpacer />
            )}
            {digitKey('0')}
            <NumberPadKey label={t('number_pad.delete.button')} onPress={() => onAction({ type: 'backspace' })}>
              <NumberPadKeyIcon name="backspace" color={tokens.ink} />
            </NumberPadKey>
          </View>
        </View>
        <View style={{ flex: 1, gap: spacing[2] }}>
          <NumberPadKey label={t('number_pad.hide.button')} onPress={props.onHide}>
            <NumberPadKeyIcon name="keyboardHide" color={tokens.ink} />
          </NumberPadKey>
          <NumberPadKey
            label={t('number_pad.step_down.button', { step })}
            onPress={() => onAction({ type: 'step', direction: 'down' })}
          >
            <SurfaceText numeric font="text-lg" style={{ color: tokens.ink }}>
              {`−${localeFormatBigNumber(buffer.step)}`}
            </SurfaceText>
          </NumberPadKey>
          <NumberPadKey
            label={t('number_pad.step_up.button', { step })}
            onPress={() => onAction({ type: 'step', direction: 'up' })}
          >
            <SurfaceText numeric font="text-lg" style={{ color: tokens.ink }}>
              {`+${localeFormatBigNumber(buffer.step)}`}
            </SurfaceText>
          </NumberPadKey>
          <NumberPadKey
            primary
            label={props.primary === 'next' ? t('number_pad.next.button') : t('number_pad.log_set.button')}
            onPress={props.onPrimary}
          >
            <NumberPadKeyIcon name={props.primary === 'next' ? 'arrowForward' : 'check'} color={tokens.onAccent} />
          </NumberPadKey>
        </View>
      </View>
    </Animated.View>
  );
}
