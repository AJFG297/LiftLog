import { MsIconSrc } from '@/components/presentation/foundation/ms-icon-source';
import { MIN_TOUCH_TARGET } from '@/components/presentation/foundation/touch-target';
import { fontFamily, spacing, useAppTheme } from '@/hooks/useAppTheme';
import { Pressable, TextInput, View } from 'react-native';

interface SearchFieldProps {
  /** The input is `${testID}-input` and its clear button `${testID}-clear`. */
  testID: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  accessibilityLabel: string;
  clearLabel: string;
}

/** A search field on a list: a search icon, the input, and a clear button once something is typed. */
export function SearchField({
  testID,
  value,
  onChange,
  placeholder,
  accessibilityLabel,
  clearLabel,
}: SearchFieldProps) {
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
        testID={`${testID}-input`}
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
          testID={`${testID}-clear`}
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
