import { useState } from 'react';
import { createThemeFromSourceColor } from '@pchmn/expo-material3-theme/build/utils/createMaterial3Theme';

export const isDynamicThemeSupported = false;
export const createMaterial3Theme = createThemeFromSourceColor;
export function useMaterial3Theme(options: { fallbackSourceColor: string }) {
  const [theme, setTheme] = useState(() => createMaterial3Theme(options.fallbackSourceColor));
  return { theme, resetTheme: () => setTheme(createMaterial3Theme(options.fallbackSourceColor)) };
}
