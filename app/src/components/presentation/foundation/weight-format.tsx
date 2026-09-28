import { ColorChoice, font, FontChoice, fontFamily, numberStyle, useAppTheme } from '@/hooks/useAppTheme';
import { bodyweightLoadText, bodyweightPrefix, shortFormatWeightUnit, Weight } from '@/models/weight';
import { localeFormatBigNumber } from '@/utils/locale-bignumber';
import { useTranslate } from '@tolgee/react';
import { Text, TextStyle } from 'react-native';

interface WeightFormatProps {
  weight: Weight | undefined;

  /** When set, the weight is the added/assisted load on top of bodyweight, shown as `BW`, `BW +10 kg`, `BW −20 kg`. */
  usesBodyweight?: boolean;
  fontSize?: FontChoice;
  color?: ColorChoice;
  fontWeight?: TextStyle['fontWeight'];
  decimalPlaces?: number;
}
export default function WeightFormat(props: WeightFormatProps) {
  const { t } = useTranslate();
  const { colors } = useAppTheme();
  const value = props.weight?.value.decimalPlaces(props.decimalPlaces ?? 4);
  const style = {
    display: 'flex',
    alignItems: 'center',
    flexDirection: 'row',
    fontFamily: fontFamily.text,
    color: colors[props.color ?? 'onSurface'],
    fontWeight: props.fontWeight,
    ...(props.fontSize ? { ...font[props.fontSize] } : undefined),
  } as const;

  const label = t('exercise.short_bodyweight.label');
  if (props.usesBodyweight && (!value || value.isZero())) {
    return <Text style={style}>{label}</Text>;
  }

  // Only the digits go in the number family; the bodyweight prefix and the unit stay in Geist.
  return (
    <Text style={style}>
      {props.usesBodyweight && value ? bodyweightPrefix(label, value) : null}
      <Text style={numberStyle}>{localeFormatBigNumber(value) || '-'}</Text>{' '}
      <Text style={{ fontSize: 12 }}>{shortFormatWeightUnit(props.weight?.unit)}</Text>
    </Text>
  );
}

/**
 * {@link WeightFormat} as one plain string, for text that can't nest it (a translated template):
 * `60 kg`, or on bodyweight `BW`, `BW +10 kg`, `BW -20 kg`.
 */
export function formatWeightText(weight: Weight): string;
export function formatWeightText(weight: Weight, usesBodyweight: boolean, bodyweightLabel: string): string;
export function formatWeightText(weight: Weight, usesBodyweight = false, bodyweightLabel = ''): string {
  // Spaced like WeightFormat, which this sits beside on a set tile.
  const text = `${localeFormatBigNumber(weight.value)} ${shortFormatWeightUnit(weight.unit)}`;
  return usesBodyweight ? bodyweightLoadText(weight, bodyweightLabel, text) : text;
}
