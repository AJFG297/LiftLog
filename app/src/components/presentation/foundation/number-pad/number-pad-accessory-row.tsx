import { Chip } from '@/components/presentation/foundation/chip';
import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { spacing, tabularText, useAppTheme } from '@/hooks/useAppTheme';
import { platesFor, type LoadUnit } from '@/models/plates';
import { RPE_VALUES, type Rpe } from '@/models/session-models/rpe';
import { shortFormatWeightUnit } from '@/models/weight';
import { localeFormatBigNumber } from '@/utils/locale-bignumber';
import { useTranslate } from '@tolgee/react';
import BigNumber from 'bignumber.js';
import { ScrollView, View } from 'react-native';
import type { NumberPadAccessory } from './number-pad-accessory';
import { PlateStack } from './plate-stack';

export function formatLoad(value: BigNumber, unit: LoadUnit | undefined): string {
  return unit ? `${localeFormatBigNumber(value)} ${shortFormatWeightUnit(unit)}` : localeFormatBigNumber(value);
}

export function NumberPadAccessoryRow(props: {
  accessory: NumberPadAccessory | undefined;
  value: BigNumber | undefined;
  unit: LoadUnit | undefined;
}) {
  const { accessory, value, unit } = props;
  return (
    <View style={{ minHeight: spacing[12], justifyContent: 'center' }}>
      {accessory?.kind === 'rpe' ? (
        <RpeRow value={accessory.value} onChange={accessory.onChange} />
      ) : accessory?.kind === 'plates' && value ? (
        <PlatesRow bar={accessory.bar} plates={accessory.plates} value={value} unit={unit} />
      ) : (accessory?.kind === 'perDumbbell' || accessory?.kind === 'onStack') && value ? (
        <LoadRow kind={accessory.kind} value={value} unit={unit} />
      ) : undefined}
    </View>
  );
}

function AccessoryText(props: { children: string }) {
  const { tokens } = useAppTheme();
  return (
    <SurfaceText
      font="text-sm"
      numberOfLines={2}
      accessibilityLiveRegion="polite"
      style={[tabularText, { flexShrink: 1, color: tokens.muted }]}
    >
      {props.children}
    </SurfaceText>
  );
}

function PlatesRow(props: {
  bar: BigNumber;
  plates: readonly BigNumber[];
  value: BigNumber;
  unit: LoadUnit | undefined;
}) {
  const { t } = useTranslate();
  const loading = platesFor(props.value, props.bar, props.plates);
  if (loading.kind === 'belowBar') {
    return (
      <AccessoryText>
        {t('number_pad.plates.below_bar.label', { bar: formatLoad(props.bar, props.unit) })}
      </AccessoryText>
    );
  }

  const perSide =
    loading.perSide.length === 0
      ? t('number_pad.plates.bar_only.label')
      : t('number_pad.plates.per_side.label', {
          plates: loading.perSide.map((plate) => localeFormatBigNumber(plate)).join(' + '),
        });
  const text =
    loading.kind === 'inexact'
      ? t('number_pad.plates.inexact.label', { plates: perSide, amount: formatLoad(loading.remainder, props.unit) })
      : perSide;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
      <View style={{ flex: 1 }}>
        <AccessoryText>{text}</AccessoryText>
      </View>
      {loading.perSide.length > 0 ? (
        <PlateStack perSide={loading.perSide} heaviest={BigNumber.max(...props.plates)} />
      ) : undefined}
    </View>
  );
}

function LoadRow(props: { kind: 'perDumbbell' | 'onStack'; value: BigNumber; unit: LoadUnit | undefined }) {
  const { t } = useTranslate();
  const weight = formatLoad(props.value, props.unit);
  return (
    <AccessoryText>
      {props.kind === 'perDumbbell'
        ? t('number_pad.per_dumbbell.label', { weight })
        : t('number_pad.on_stack.label', { weight })}
    </AccessoryText>
  );
}

function RpeRow(props: { value: Rpe | undefined; onChange: (rpe: Rpe | undefined) => void }) {
  const { t } = useTranslate();
  const { tokens } = useAppTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
      <SurfaceText font="text-sm" weight="600" style={{ color: tokens.muted }}>
        {t('number_pad.rpe.label')}
      </SurfaceText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing[2] }}>
        {RPE_VALUES.map((rpe) => (
          <Chip
            key={rpe}
            numeric
            label={localeFormatBigNumber(new BigNumber(rpe))}
            accessibilityLabel={t('number_pad.rpe_value.label', { rpe: localeFormatBigNumber(new BigNumber(rpe)) })}
            selected={props.value === rpe}
            onPress={() => props.onChange(props.value === rpe ? undefined : rpe)}
          />
        ))}
      </ScrollView>
    </View>
  );
}
