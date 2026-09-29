import StackWithHeader from '@/components/layout/stack-with-header';
import { formSheetOptions } from '@/components/presentation/foundation/form-sheet-options';
import { Stack } from 'expo-router';

export default function Layout() {
  return (
    <StackWithHeader>
      <Stack.Screen name="session/index" options={{ headerShown: false }} />
      <Stack.Screen name="session/exercises" options={formSheetOptions([0.7, 0.95])} />
      <Stack.Screen name="session/set-type" options={formSheetOptions([0.65, 0.95])} />
    </StackWithHeader>
  );
}
