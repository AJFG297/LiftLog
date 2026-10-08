import { AppThemeProvider } from '@/hooks/useAppTheme';
import { I18nManager, LogBox, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppStateProvider } from '@/components/smart/app-state-provider';
import { PlanImportGate } from '@/components/smart/plan-import-gate';
import SnackbarProvider from '@/components/smart/snackbar-provider';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import ServicesProvider from '@/components/smart/services-provider';
import { install } from 'react-native-quick-crypto';
import StackWithHeader from '@/components/layout/stack-with-header';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { requireOptionalNativeModule } from 'expo';
import { ToastProvider } from '@/components/presentation/foundation/toast';
import { formSheetOptions } from '@/components/presentation/foundation/form-sheet-options';

install();

if (__DEV__) {
  // oxlint-disable-next-line typescript/no-unsafe-assignment
  const DevMenuPreferences = requireOptionalNativeModule('DevMenuPreferences');
  // oxlint-disable-next-line typescript/no-unsafe-call typescript/no-unsafe-member-access
  DevMenuPreferences?.setPreferencesAsync({ showFloatingActionButton: false, showsAtLaunch: false });
}

LogBox.ignoreAllLogs();

if (Platform.OS !== 'web') {
  I18nManager.swapLeftAndRightInRTL?.(true);
}

// A deep link straight into a stack over the tabs (a shared feed item) still gets the tabs beneath it.
export const unstable_settings = {
  initialRouteName: '(tabs)',
};

export default function RootLayout() {
  return (
    <GestureHandlerRootView>
      <KeyboardProvider>
        <SafeAreaProvider>
          <ServicesProvider>
            <AppThemeProvider>
              <AppStateProvider>
                <SnackbarProvider>
                  <ToastProvider>
                    {Platform.OS === 'android' && <StatusBar style="auto" />}
                    <PlanImportGate />
                    <Layout />
                  </ToastProvider>
                </SnackbarProvider>
              </AppStateProvider>
            </AppThemeProvider>
          </ServicesProvider>
        </SafeAreaProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}

function Layout() {
  return (
    <StackWithHeader>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      {/* The feed opens from You rather than being a tab, so it sits over the tabs with a stack of its own. */}
      <Stack.Screen name="feed" options={{ headerShown: false }} />
      <Stack.Screen name="exercise-search" options={{ presentation: 'modal', headerShown: false }} />
      {/* One edit exercise sheet, opened from a workout or from a routine, with Load as a sheet over it. */}
      <Stack.Screen name="exercise-editor" options={formSheetOptions([0.95])} />
      <Stack.Screen name="routine-exercise-editor" options={formSheetOptions([0.95])} />
      <Stack.Screen name="exercise-load" options={formSheetOptions([0.55, 0.9])} />
      <Stack.Screen name="exercise-warmups" options={formSheetOptions([0.75, 0.95])} />
      <Stack.Screen name="exercise-progression" options={formSheetOptions([0.9])} />
      {/* Grows when a different rest after a failed set brings its own wheels, so Save stays in view. */}
      <Stack.Screen name="exercise-edit-rest" options={formSheetOptions('fitToContents')} />
      <Stack.Screen name="exercise-history" options={formSheetOptions([0.6, 0.95])} />
      <Stack.Screen name="workout-editor" />
      <Stack.Screen name="workout-detail/index" />
      <Stack.Screen name="workout-detail/edit" />
      <Stack.Screen name="session/post-workout" options={{ headerShown: false }} />
      <Stack.Screen name="diff-save" options={formSheetOptions([0.75, 0.95])} />
      <Stack.Screen name="routine-set-type" options={formSheetOptions([0.8, 0.95])} />
      <Stack.Screen name="dev/components-sheet" options={formSheetOptions([0.5, 0.9])} />
    </StackWithHeader>
  );
}
