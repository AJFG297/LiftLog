import IconButton from '@/components/presentation/foundation/icon-button';
import { useAppTheme } from '@/hooks/useAppTheme';
import { DatePickerDialog, Host } from '@expo/ui/jetpack-compose';
import { useState } from 'react';
import { DatePickerButtonProps } from './date-picker-button-props';

/** A calendar button that opens the Material date picker dialog. */
export function DatePickerButton({ value, onChange, accessibilityLabel }: DatePickerButtonProps) {
  const { colors } = useAppTheme();
  const [open, setOpen] = useState(false);
  return (
    <>
      <IconButton icon="calendar" accessibilityLabel={accessibilityLabel} onPress={() => setOpen(true)} />
      {/* The host only exists while the dialog is open: Compose drops a host's contents when it is
          reattached, so mounting fresh each time is the reliable way to show it again. */}
      {open && (
        <Host matchContents seedColor={colors.seedColor} colorScheme={colors.scheme}>
          <DatePickerDialog
            // Compose reads the date in UTC, so pass the local calendar day at UTC midnight.
            initialDate={new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate())).toISOString()}
            // The field beside the button already takes typed dates, so the dialog only offers the calendar.
            showVariantToggle={false}
            onDateSelected={(date) => {
              setOpen(false);
              // Confirming with no day picked reports null, which arrives as the epoch.
              if (date && !Number.isNaN(date.getTime()) && date.getTime() !== 0) {
                onChange(new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
              }
            }}
            onDismissRequest={() => setOpen(false)}
          />
        </Host>
      )}
    </>
  );
}
