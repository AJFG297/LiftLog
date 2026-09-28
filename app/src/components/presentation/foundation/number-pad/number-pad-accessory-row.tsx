import { Chip } from '@/components/presentation/foundation/chip';
import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { formatWeightText } from '@/components/presentation/foundation/weight-format';
import { spacing, tabularText, useAppTheme } from '@/hooks/useAppTheme';
import { platesFor } from '@/models/plates';
import { RPE_VALUES, type Rpe } from '@/models/session-models/rpe';
import { type LoadUnit, Weight } from '@/models/weight';
import { localeFormatBigNumber } from '@/utils/locale-bignumber';
import { useTranslate } from '@tolgee/react';
import BigNumber from 'bignumber.js';
import { ScrollView, View } from 'react-native';
import type { NumberPadAccessory } from './number-pad-accessory';
import { PlateStack } from './plate-stack';

interface NumberPadAccessoryRowProps {
  accessory: NumberPadAccessory | undefined;
  value: BigNumber | undefined;
}

export function NumberPadAccessoryRow(props: NumberPadAccessoryRowProps) {
  return (
    <View style={{ minHeight: spacing[12], justifyContent: 'center' }}>
      <AccessoryContent accessory={props.accessory} value={props.value} />
    </View>
  );
}

function AccessoryContent({ accessory, value }: NumberPadAccessoryRowProps) {
  switch (accessory?.kind) {
    case 'rpe':
      return <RpeRow value={accessory.value} onChange={accessory.onChange} />;
    case 'plates':
      return value ? (
        <PlatesRow bar={accessory.bar} plates={accessory.plates} value={value} unit={accessory.unit} />
      ) : null;
    case 'perDumbbell':
    case 'onStack':
      return value ? <LoadRow kind={accessory.kind} value={value} unit={accessory.unit} /> : null;
    case undefined:
      return null;
  }
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

function PlatesRow(props: { bar: BigNumber; plates: readonly BigNumber[]; value: BigNumber; unit: LoadUnit }) {
  const { t } = useTranslate();
  const loading = platesFor(props.value, props.bar, props.plates);
  if (loading.kind === 'belowBar') {
    return (
      <AccessoryText>
        {t('number_pad.plates.below_bar.label', { bar: formatWeightText(new Weight(props.bar, props.unit)) })}
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
      ? t('number_pad.plates.inexact.label', {
          plates: perSide,
          amount: formatWeightText(new Weight(loading.remainder, props.unit)),
        })
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

const LOAD_LABEL = {
  perDumbbell: 'number_pad.per_dumbbell.label',
  onStack: 'number_pad.on_stack.label',
} as const;

function LoadRow(props: { kind: keyof typeof LOAD_LABEL; value: BigNumber; unit: LoadUnit }) {
  const { t } = useTranslate();
  return (
    <AccessoryText>
      {t(LOAD_LABEL[props.kind], { weight: formatWeightText(new Weight(props.value, props.unit)) })}
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
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
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
