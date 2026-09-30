import StackWithHeader from '@/components/layout/stack-with-header';
import { formSheetOptions } from '@/components/presentation/foundation/form-sheet-options';
import { Stack } from 'expo-router';

export default function Layout() {
  return (
    <StackWithHeader>
      {/* Home draws its own header: the date, the title and the streak. */}
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="session/index" options={{ headerShown: false }} />
      <Stack.Screen name="session/exercises" options={formSheetOptions([0.7, 0.95])} />
      {/* Tall enough that all five set types show above the Android tab bar, which draws over this stack's sheets. */}
      <Stack.Screen name="session/set-type" options={formSheetOptions([0.8, 0.95])} />
      <Stack.Screen name="session/rest" options={formSheetOptions([0.75, 0.95])} />
    </StackWithHeader>
  );
}
