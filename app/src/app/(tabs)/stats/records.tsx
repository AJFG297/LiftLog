import { useAppTheme } from '@/hooks/useAppTheme';
import { useTranslate } from '@tolgee/react';
import { Stack } from 'expo-router';
import { View } from 'react-native';

// A placeholder so the Progress tab can link here; PM-40 fills it in.
export default function RecordsScreen() {
  const { t } = useTranslate();
  const { tokens } = useAppTheme();
  return (
    <View style={{ flex: 1, backgroundColor: tokens.bg }}>
      <Stack.Screen options={{ title: t('progress.records.title') }} />
    </View>
  );
}
