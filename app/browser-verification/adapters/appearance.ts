import { Appearance } from 'react-native';

declare const document: { documentElement: { style: { colorScheme: string } } };
// React Native Web has no native appearance override; use the browser's CSS color scheme.
Appearance.setColorScheme = (scheme) => {
  document.documentElement.style.colorScheme = scheme === 'light' || scheme === 'dark' ? scheme : 'normal';
};
