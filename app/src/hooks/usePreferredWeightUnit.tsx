import { LoadUnit, WeightUnit } from '@/models/weight';
import { useAppSelector } from '@/store';
import { selectPreferredWeightUnit } from '@/store/settings';
import { localeFormatBigNumber } from '@/utils/locale-bignumber';
import { useTranslate } from '@tolgee/react';
import BigNumber from 'bignumber.js';

export function usePreferredWeightUnit(): WeightUnit {
  const useImperial = useAppSelector((x) => x.settings.useImperialUnits);
  return useImperial ? 'pounds' : 'kilograms';
}

export function usePreferredWeightSuffix(): 'kg' | 'lbs' {
  const useImperial = useAppSelector((x) => x.settings.useImperialUnits);
  return useImperial ? 'lbs' : 'kg';
}

/** The preferred unit with its label, and a weight written out in it: "2.5 kg". */
export function usePreferredWeightFormat(): {
  unit: LoadUnit;
  unitLabel: string;
  formatWeight: (weight: BigNumber) => string;
} {
  const { t } = useTranslate();
  const unit = useAppSelector(selectPreferredWeightUnit);
  const unitLabel = t(unit === 'pounds' ? 'routine_editor.unit.pounds.label' : 'routine_editor.unit.kilograms.label');
  return { unit, unitLabel, formatWeight: (weight) => `${localeFormatBigNumber(weight)} ${unitLabel}` };
}
