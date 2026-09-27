import { ColorChoice, font, FontChoice, useAppTheme } from '@/hooks/useAppTheme';
import { shortFormatWeightUnit, Weight } from '@/models/weight';
import { localeFormatBigNumber } from '@/utils/locale-bignumber';
import { useTranslate } from '@tolgee/react';
import { Text, TextStyle } from 'react-native';
import BigNumber from 'bignumber.js';

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
    color: colors[props.color ?? 'onSurface'],
    fontWeight: props.fontWeight,
    ...(props.fontSize ? { ...font[props.fontSize] } : undefined),
  } as const;

  if (props.usesBodyweight) {
    const label = t('exercise.short_bodyweight.label');
    if (!value || value.isZero()) {
      return <Text style={style}>{label}</Text>;
    }
    return (
      <Text style={style}>
        {bodyweightPrefix(label, value)}
        {localeFormatBigNumber(value)} <Text style={{ fontSize: 12 }}>{shortFormatWeightUnit(props.weight?.unit)}</Text>
      </Text>
    );
  }

  const weightDisplay = localeFormatBigNumber(value) || '-';
  return (
    <Text style={style}>
      {weightDisplay} <Text style={{ fontSize: 12 }}>{shortFormatWeightUnit(props.weight?.unit)}</Text>
    </Text>
  );
}

/**
 * {@link WeightFormat} as one plain string, for text that can't nest it (a translated template):
 * `60 kg`, or on bodyweight `BW`, `BW +10 kg`, `BW -20 kg`.
 */
export function formatWeightText(weight: Weight, usesBodyweight: boolean, bodyweightLabel: string): string {
  // Spaced like WeightFormat, which this sits beside on a set tile.
  const text = `${localeFormatBigNumber(weight.value)} ${shortFormatWeightUnit(weight.unit)}`;
  if (!usesBodyweight) {
    return text;
  }
  if (weight.value.isZero()) {
    return bodyweightLabel;
  }
  return `${bodyweightPrefix(bodyweightLabel, weight.value)}${text}`;
}

/** `BW +` before added load; a negative (assisted) load carries its own minus sign. */
function bodyweightPrefix(label: string, value: BigNumber): string {
  return `${label} ${value.isGreaterThan(0) ? '+' : ''}`;
}
