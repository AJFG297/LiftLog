import {
  NumberPad,
  type NumberPadAccessory,
  type NumberPadBuffer,
  type NumberPadField,
  numberPadReducer,
  numberPadValue,
  openNumberPad,
  weightAccessoryFor,
} from '@/components/presentation/foundation/number-pad';
import { Chip } from '@/components/presentation/foundation/chip';
import SegmentedPicker from '@/components/presentation/foundation/segmented-picker';
import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { formatWeightText } from '@/components/presentation/foundation/weight-format';
import { rounding, spacing, tabularText, useAppTheme } from '@/hooks/useAppTheme';
import { useMountEffect } from '@/hooks/useMountEffect';
import { equipmentClassOf, weightStepFor } from '@/models/equipment';
import type { Rpe } from '@/models/session-models/rpe';
import { type LoadUnit, shortFormatWeightUnit, Weight } from '@/models/weight';
import { useAppSelector } from '@/store';
import { selectPreferredWeightUnit, setThemeMode, type ThemeMode } from '@/store/settings';
import BigNumber from 'bignumber.js';
import { getLocales } from 'expo-localization';
import { Redirect, Stack, useLocalSearchParams } from 'expo-router';
import { type ReactNode, useReducer, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useDispatch } from 'react-redux';

type FieldKind = 'weight' | 'reps';
type DevEquipment = 'barbell' | 'dumbbell' | 'cable' | 'machine' | 'unknown';

const DEV_EQUIPMENT: { value: DevEquipment; label: string }[] = [
  { value: 'barbell', label: 'Barbell' },
  { value: 'dumbbell', label: 'Dumbbell' },
  { value: 'cable', label: 'Cable' },
  { value: 'machine', label: 'Machine' },
  { value: 'unknown', label: 'Other' },
];

const PLACEHOLDER_WEIGHT: Record<LoadUnit, number> = { kilograms: 60, pounds: 135 };
const PLACEHOLDER_REPS = 8;

export default function DevNumberPadRoute() {
  if (!__DEV__) {
    return <Redirect href="/" />;
  }
  return <DevNumberPad />;
}

function DevNumberPad() {
  const { tokens } = useAppTheme();
  const dispatch = useDispatch();
  const params = useLocalSearchParams<{ unit?: string; field?: string; equipment?: string; theme?: string }>();
  const preferredUnit = useAppSelector(selectPreferredWeightUnit);
  const barWeight = useAppSelector((state) => state.settings.barWeight);
  const availablePlates = useAppSelector((state) => state.settings.availablePlates);
  const themeMode = useAppSelector((state) => state.settings.themeMode);

  const [unit, setUnit] = useState<LoadUnit>(
    params.unit === 'pounds' || params.unit === 'kilograms' ? params.unit : preferredUnit,
  );
  const [equipment, setEquipment] = useState<DevEquipment>(
    isDevEquipment(params.equipment) ? params.equipment : 'barbell',
  );
  const [fieldKind, setFieldKind] = useState<FieldKind>(params.field === 'reps' ? 'reps' : 'weight');
  const [rpe, setRpe] = useState<Rpe | undefined>(undefined);
  const [committed, setCommitted] = useState<Record<FieldKind, BigNumber | undefined>>({
    weight: undefined,
    reps: undefined,
  });
  const [logged, setLogged] = useState<string | undefined>(undefined);
  const [visible, setVisible] = useState(true);

  const fieldFor = (kind: FieldKind, forUnit: LoadUnit, forEquipment: DevEquipment): NumberPadField =>
    kind === 'weight'
      ? {
          placeholder: PLACEHOLDER_WEIGHT[forUnit],
          allowDecimal: true,
          step: weightStepFor(classOf(forEquipment), forUnit, new BigNumber(2.5)),
        }
      : { placeholder: PLACEHOLDER_REPS, allowDecimal: false, step: 1 };

  const [buffer, send] = useReducer(numberPadReducer, fieldFor(fieldKind, unit, equipment), openNumberPad);

  useMountEffect(() => {
    if (params.theme === 'light' || params.theme === 'dark') {
      dispatch(setThemeMode(params.theme));
    }
  });

  const open = (kind: FieldKind, forUnit = unit, forEquipment = equipment) => {
    setFieldKind(kind);
    setVisible(true);
    send({ type: 'reset', field: fieldFor(kind, forUnit, forEquipment) });
  };

  const commitAndOpen = (kind: FieldKind) => {
    setCommitted({ ...committed, [fieldKind]: numberPadValue(buffer) });
    open(kind);
  };

  const logSet = () => {
    const weight = committed.weight ?? new BigNumber(PLACEHOLDER_WEIGHT[unit]);
    const reps = numberPadValue(buffer) ?? new BigNumber(PLACEHOLDER_REPS);
    setLogged(
      `Logged ${formatWeightText(new Weight(weight, unit))} × ${reps.toString()}${rpe === undefined ? '' : ` @${rpe}`}`,
    );
    setCommitted({ weight: undefined, reps: undefined });
    setRpe(undefined);
    open('weight');
  };

  const accessory: NumberPadAccessory | undefined =
    fieldKind === 'reps'
      ? { kind: 'rpe', value: rpe, onChange: setRpe }
      : weightAccessoryFor(classOf(equipment), unit, { bar: barWeight[unit], plates: availablePlates[unit] });

  return (
    <View style={{ flex: 1, backgroundColor: tokens.bg }}>
      <Stack.Screen options={{ title: 'Number pad' }} />
      <ScrollView contentContainerStyle={{ padding: spacing.pageHorizontalMargin, gap: spacing[4] }}>
        <DevControl label="Unit">
          <SegmentedPicker
            value={unit}
            options={[
              { value: 'kilograms', label: 'kg' },
              { value: 'pounds', label: 'lb' },
            ]}
            onChange={(value: LoadUnit) => {
              setUnit(value);
              open(fieldKind, value);
            }}
          />
        </DevControl>
        <DevControl label="Equipment">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
            {DEV_EQUIPMENT.map((option) => (
              <Chip
                key={option.value}
                label={option.label}
                selected={equipment === option.value}
                onPress={() => {
                  setEquipment(option.value);
                  open(fieldKind, unit, option.value);
                }}
              />
            ))}
          </View>
        </DevControl>
        <DevControl label="Theme">
          <SegmentedPicker
            value={themeMode}
            options={[
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
              { value: 'system', label: 'System' },
            ]}
            onChange={(value: ThemeMode) => dispatch(setThemeMode(value))}
          />
        </DevControl>

        <View style={{ flexDirection: 'row', gap: spacing[3] }}>
          <DevField
            label={shortFormatWeightUnit(unit)}
            active={visible && fieldKind === 'weight'}
            buffer={fieldKind === 'weight' ? buffer : undefined}
            committed={committed.weight}
            placeholder={PLACEHOLDER_WEIGHT[unit]}
            onPress={() => commitAndOpen('weight')}
          />
          <DevField
            label="Reps"
            active={visible && fieldKind === 'reps'}
            buffer={fieldKind === 'reps' ? buffer : undefined}
            committed={committed.reps}
            placeholder={PLACEHOLDER_REPS}
            onPress={() => commitAndOpen('reps')}
          />
        </View>
        {logged ? (
          <SurfaceText font="text-sm" style={[tabularText, { color: tokens.muted }]}>
            {logged}
          </SurfaceText>
        ) : undefined}
      </ScrollView>

      <NumberPad
        visible={visible}
        buffer={buffer}
        onAction={send}
        unit={fieldKind === 'weight' ? unit : undefined}
        accessory={accessory}
        primary={fieldKind === 'weight' ? 'next' : 'log'}
        onPrimary={fieldKind === 'weight' ? () => commitAndOpen('reps') : logSet}
        onHide={() => setVisible(false)}
      />
    </View>
  );
}

function DevControl(props: { label: string; children: ReactNode }) {
  const { tokens } = useAppTheme();
  return (
    <View style={{ gap: spacing[1] }}>
      <SurfaceText font="text-xs" style={{ color: tokens.muted }}>
        {props.label}
      </SurfaceText>
      {props.children}
    </View>
  );
}

function DevField(props: {
  label: string;
  active: boolean;
  buffer: NumberPadBuffer | undefined;
  committed: BigNumber | undefined;
  placeholder: number;
  onPress: () => void;
}) {
  const { tokens } = useAppTheme();
  const decimalSeparator = getLocales()[0]?.decimalSeparator || '.';
  const typed = props.buffer ? props.buffer.typed : (props.committed?.toString() ?? null);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${props.label}: ${typed ?? props.placeholder}`}
      onPress={props.onPress}
      style={{
        flex: 1,
        gap: spacing[1],
        padding: spacing[3],
        borderRadius: rounding.roundedRectangleRadius,
        backgroundColor: tokens.card,
        borderWidth: 2,
        borderColor: props.active ? tokens.accent : tokens.line,
      }}
    >
      <SurfaceText font="text-xs" style={{ color: tokens.muted }}>
        {props.label}
      </SurfaceText>
      <SurfaceText
        numeric
        font="text-3xl"
        accessibilityLiveRegion="polite"
        style={{ color: typed === null ? tokens.placeholder : tokens.ink }}
      >
        {typed === null ? String(props.placeholder) : typed.replace('.', decimalSeparator)}
      </SurfaceText>
    </Pressable>
  );
}

function isDevEquipment(value: string | undefined): value is DevEquipment {
  return DEV_EQUIPMENT.some((option) => option.value === value);
}

function classOf(equipment: DevEquipment) {
  return equipmentClassOf(equipment === 'unknown' ? null : equipment);
}
