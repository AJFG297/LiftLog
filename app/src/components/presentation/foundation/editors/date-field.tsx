import { DatePickerButton } from '@/components/presentation/foundation/date-picker-button';
import { TextField } from '@/components/presentation/foundation/text-field';
import { useTranslate } from '@tolgee/react';
import { useState } from 'react';
import { formatDateForField, parseDateFromField } from './date-field-format';

interface DateFieldProps {
  value: Date;
  onChange: (date: Date) => void;
  testID?: string;
}

/** A date typed in the locale's numeric format, or picked from the native calendar. */
export function DateField({ value, onChange, testID }: DateFieldProps) {
  const { t } = useTranslate();
  const [text, setText] = useState(() => formatDateForField(value));
  const typed = parseDateFromField(text);
  // A pick from the calendar (or a change from elsewhere) replaces what was typed.
  const [shownValue, setShownValue] = useState(value);
  if (shownValue.getTime() !== value.getTime()) {
    setShownValue(value);
    if (typed?.getTime() !== value.getTime()) {
      setText(formatDateForField(value));
    }
  }
  return (
    <TextField
      testID={testID}
      label={t('generic.date.label')}
      value={text}
      inputMode="numeric"
      error={text !== '' && !typed}
      onChangeText={(next) => {
        setText(next);
        const date = parseDateFromField(next);
        if (date && date.getTime() !== value.getTime()) {
          onChange(date);
        }
      }}
      onBlur={() => setText(formatDateForField(value))}
      placeholder={formatDateForField(new Date(2000, 11, 31))}
      right={
        <DatePickerButton value={value} onChange={onChange} accessibilityLabel={t('date.pick_from_calendar.button')} />
      }
    />
  );
}
