import { Chip } from '@/components/presentation/foundation/chip';
import { MsIconSrc } from '@/components/presentation/foundation/ms-icon-source';
import { MIN_TOUCH_TARGET } from '@/components/presentation/foundation/touch-target';
import { fontFamily, spacing, useAppTheme } from '@/hooks/useAppTheme';
import { Pressable, ScrollView, TextInput, View } from 'react-native';

interface ExercisePickerSearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  accessibilityLabel: string;
  clearLabel: string;
}

/** The picker's search field, with a clear button once something is typed. */
export function ExercisePickerSearchField({
  value,
  onChange,
  placeholder,
  accessibilityLabel,
  clearLabel,
}: ExercisePickerSearchFieldProps) {
  const { tokens } = useAppTheme();
  return (
    <View
      style={{
        minHeight: 46,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: tokens.line,
        backgroundColor: tokens.card,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing[2],
        paddingLeft: spacing[3],
      }}
    >
      <MsIconSrc name="search" size={18} color={tokens.muted} />
      <TextInput
        testID="exercise-search-input"
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={tokens.placeholder}
        accessibilityLabel={accessibilityLabel}
        autoCapitalize="words"
        autoCorrect={false}
        returnKeyType="search"
        style={{
          flex: 1,
          minWidth: 0,
          minHeight: MIN_TOUCH_TARGET,
          padding: 0,
          fontFamily: fontFamily.text,
          fontSize: 16,
          color: tokens.ink,
        }}
      />
      {value ? (
        <Pressable
          testID="exercise-search-clear"
          onPress={() => onChange('')}
          accessibilityRole="button"
          accessibilityLabel={clearLabel}
          style={{ width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' }}
        >
          <View
            style={{
              width: 28,
              height: 28,
              borderRadius: 14,
              backgroundColor: tokens.track,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <MsIconSrc name="close" size={14} color={tokens.ink} />
          </View>
        </Pressable>
      ) : (
        <View style={{ width: spacing[3] }} />
      )}
    </View>
  );
}

export interface ChipOption<T> {
  value: T;
  label: string;
}

interface ExercisePickerChipRowProps<T> {
  options: ChipOption<T>[];
  selected: T;
  onSelect: (value: T) => void;
  /** Read out before the row, e.g. "Muscle". */
  accessibilityLabel: string;
  testID?: string;
}

/**
 * One row of filter chips that scrolls sideways past the screen's edge. Exactly one is on; the first option
 * is the "All" that turns the filter off.
 */
export function ExercisePickerChipRow<T extends string | undefined>({
  options,
  selected,
  onSelect,
  accessibilityLabel,
  testID,
}: ExercisePickerChipRowProps<T>) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      style={{ marginHorizontal: -spacing.pageHorizontalMargin }}
      // Chips carry a 4pt touch inset of their own, so the row's padding is that much less than the page's.
      contentContainerStyle={{ paddingHorizontal: spacing.pageHorizontalMargin - spacing[1] }}
    >
      {options.map((option) => (
        <Chip
          key={option.value ?? 'all'}
          testID={testID ? `${testID}-${option.value ?? 'all'}` : undefined}
          label={option.label}
          selected={option.value === selected}
          onPress={() => onSelect(option.value)}
        />
      ))}
    </ScrollView>
  );
}
