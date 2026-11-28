import { useAppTheme } from '@/hooks/useAppTheme';
import { DatePicker, Host } from '@expo/ui/swift-ui';
import { accessibilityLabel as accessibilityLabelModifier } from '@expo/ui/swift-ui/modifiers';
import { DatePickerButtonProps } from './date-picker-button-props';

/** SwiftUI's compact date picker: the date in a pill that opens a calendar popover. */
export function DatePickerButton({ value, onChange, accessibilityLabel }: DatePickerButtonProps) {
  const { colors } = useAppTheme();
  return (
    <Host matchContents seedColor={colors.seedColor} colorScheme={colors.scheme}>
      <DatePicker
        selection={value}
        displayedComponents={['date']}
        onDateChange={onChange}
        modifiers={[accessibilityLabelModifier(accessibilityLabel)]}
      />
    </Host>
  );
}
