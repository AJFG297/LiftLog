export interface DatePickerButtonProps {
  value: Date;
  onChange: (date: Date) => void;
  /** Read out for the button that opens the calendar. */
  accessibilityLabel: string;
}
