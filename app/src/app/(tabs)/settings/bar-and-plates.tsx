import { SettingsPage } from '@/components/layout/settings-page';
import { ListRow } from '@/components/presentation/foundation/list-row';
import { SegmentedGroup } from '@/components/presentation/foundation/segmented-list';
import { SegmentedListSelect } from '@/components/presentation/foundation/segmented-list-select';
import { SegmentedListSwitch } from '@/components/presentation/foundation/segmented-list-switch';
import { formatWeightText } from '@/components/presentation/foundation/weight-format';
import { spacing } from '@/hooks/useAppTheme';
import { BAR_WEIGHTS, PLATE_SIZES } from '@/models/plates';
import { Weight } from '@/models/weight';
import { useAppSelector } from '@/store';
import { selectPreferredWeightUnit, setAvailablePlates, setBarWeight } from '@/store/settings';
import { useTranslate } from '@tolgee/react';
import { useDispatch } from 'react-redux';

export default function BarAndPlatesPage() {
  const { t } = useTranslate();
  const dispatch = useDispatch();
  const unit = useAppSelector(selectPreferredWeightUnit);
  const barWeight = useAppSelector((state) => state.settings.barWeight);
  const availablePlates = useAppSelector((state) => state.settings.availablePlates);

  const label = (weight: number) => formatWeightText(new Weight(weight, unit));
  const barOptions = [...new Set([...BAR_WEIGHTS[unit], barWeight[unit]])]
    .sort((a, b) => a - b)
    .map((weight) => ({ value: weight, label: label(weight) }));
  const plates = availablePlates[unit];
  const togglePlate = (plate: number, on: boolean) => {
    const next = on ? [...plates.filter((p) => p !== plate), plate] : plates.filter((p) => p !== plate);
    dispatch(setAvailablePlates({ ...availablePlates, [unit]: next.sort((a, b) => b - a) }));
  };

  return (
    <SettingsPage
      title={t('settings.bar_and_plates.title')}
      caption={t(
        unit === 'pounds' ? 'settings.bar_and_plates.pounds.subtitle' : 'settings.bar_and_plates.kilograms.subtitle',
      )}
    >
      <SegmentedGroup>
        <SegmentedListSelect
          testID="setBarWeight"
          icon={'fitnessCenter'}
          label={t('settings.bar_weight.label')}
          supportingText={t('settings.bar_weight.subtitle')}
          value={barWeight[unit]}
          options={barOptions}
          onChange={(value) => dispatch(setBarWeight({ ...barWeight, [unit]: value }))}
        />
      </SegmentedGroup>

      <ListRow
        title={t('settings.available_plates.label')}
        subtitle={t('settings.available_plates.subtitle')}
        style={{ minHeight: 0, paddingVertical: 0, paddingHorizontal: spacing[1] }}
      />
      <SegmentedGroup>
        {PLATE_SIZES[unit].map((plate) => (
          <SegmentedListSwitch
            key={plate}
            testID={`plate-${plate}`}
            label={label(plate)}
            value={plates.includes(plate)}
            onValueChange={(on) => togglePlate(plate, on)}
          />
        ))}
      </SegmentedGroup>
    </SettingsPage>
  );
}
