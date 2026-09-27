import FocusRing, { ANIMATION_DURATION } from '@/components/presentation/foundation/focus-ring';
import TouchableRipple from '@/components/presentation/foundation/touchable-ripple';
import { useAppTheme, spacing } from '@/hooks/useAppTheme';
import { ColorSchemeSeed, ThemeMode } from '@/store/settings';
import { hsvToHex, type HexColor } from '@/utils/color';
import { sleep } from '@/utils/sleep';
import { ACCENT_PRESETS, accentTokens, VERMILION, type AccentPresetKey } from '@/utils/theme-tokens';
import { isDynamicThemeSupported } from '@pchmn/expo-material3-theme';
import { TranslationKey, useTranslate } from '@tolgee/react';
import { useState } from 'react';
import { Platform, View } from 'react-native';
import { FlatList } from 'react-native-gesture-handler';
import Svg, { Path } from 'react-native-svg';
import ColorPickerDialog from '@/components/presentation/foundation/editors/color-picker-dialog';
import { SelectPickerOption } from '@/components/presentation/foundation/select-picker';
import { SegmentedGroup, SegmentListFormElement } from '@/components/presentation/foundation/segmented-list';
import { SegmentedListSelect } from '@/components/presentation/foundation/segmented-list-select';
import { SegmentedListSwitch } from '@/components/presentation/foundation/segmented-list-switch';
import { SurfaceText } from '@/components/presentation/foundation/surface-text';

interface ThemeChooserProps {
  seed: ColorSchemeSeed;
  trueBlack: boolean;
  setTrueBlack: (t: boolean) => void;
  onUpdateTheme: (seed: ColorSchemeSeed) => void;
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
}

const ACCENT_LABELS: Record<AccentPresetKey, TranslationKey> = {
  vermilion: 'settings.theme.accent.vermilion',
  forest: 'settings.theme.accent.forest',
  blue: 'settings.theme.accent.blue',
  violet: 'settings.theme.accent.violet',
  rose: 'settings.theme.accent.rose',
  teal: 'settings.theme.accent.teal',
  amber: 'settings.theme.accent.amber',
};

// Swatches show the fill the app will actually use, which can differ from the seed (see `accentFill`).
const PRESETS = ACCENT_PRESETS.map((preset) => ({ ...preset, fill: accentTokens(preset.seed, 'light').accent }));

const SWATCH_SIZE = spacing[12];

function sameColor(a: ColorSchemeSeed, b: HexColor) {
  return a.toUpperCase() === b.toUpperCase();
}

function ColorBall(props: { fill: HexColor; label: string; selected: boolean; onPress: () => void }) {
  const { tokens } = useAppTheme();

  return (
    <FocusRing isSelected={props.selected}>
      <View style={{ borderRadius: SWATCH_SIZE, overflow: 'hidden' }}>
        <TouchableRipple
          accessibilityRole="radio"
          accessibilityState={{ selected: props.selected }}
          accessibilityLabel={props.label}
          style={{
            width: SWATCH_SIZE,
            height: SWATCH_SIZE,
            borderRadius: SWATCH_SIZE,
            backgroundColor: props.fill,
            borderColor: tokens.line2,
            borderWidth: 2,
          }}
          onPress={props.onPress}
        >
          <></>
        </TouchableRipple>
      </View>
    </FocusRing>
  );
}

function MatchWallpaperChip(props: { label: string; selected: boolean; onPress: () => void }) {
  const { tokens } = useAppTheme();

  return (
    <FocusRing isSelected={props.selected}>
      <View style={{ borderRadius: SWATCH_SIZE, overflow: 'hidden' }}>
        <TouchableRipple
          accessibilityRole="radio"
          accessibilityState={{ selected: props.selected }}
          accessibilityLabel={props.label}
          style={{
            height: SWATCH_SIZE,
            paddingHorizontal: spacing[4],
            justifyContent: 'center',
            borderRadius: SWATCH_SIZE,
            borderColor: tokens.line2,
            borderWidth: 2,
          }}
          onPress={props.onPress}
        >
          <SurfaceText font="text-sm" weight="600" style={{ color: tokens.ink }}>
            {props.label}
          </SurfaceText>
        </TouchableRipple>
      </View>
    </FocusRing>
  );
}

/** A ball hinting "any color" via a hue ring, or filled with the active custom color's fill when one is set. */
function CustomBall(props: { label: string; active: boolean; fill: HexColor | undefined; onPress: () => void }) {
  const { tokens } = useAppTheme();
  const size = SWATCH_SIZE;
  // Many thin wedges make the hue transitions blend into a smooth conic gradient (SVG has no conic).
  const count = 180;
  const step = (2 * Math.PI) / count;
  const r = size / 2;
  const wedges = Array.from({ length: count }, (_, i) => {
    const a0 = i * step - step;
    const a1 = (i + 1) * step + step;
    return {
      d: `M ${r} ${r} L ${r + r * Math.cos(a0)} ${r + r * Math.sin(a0)} A ${r} ${r} 0 0 1 ${r + r * Math.cos(a1)} ${r + r * Math.sin(a1)} Z`,
      fill: hsvToHex((i / count) * 360, 0.85, 1),
    };
  });

  return (
    <FocusRing isSelected={props.active}>
      <View style={{ borderRadius: size, overflow: 'hidden' }}>
        <TouchableRipple
          accessibilityRole="radio"
          accessibilityState={{ selected: props.active }}
          accessibilityLabel={props.label}
          style={{
            width: size,
            height: size,
            borderRadius: size,
            borderColor: tokens.line2,
            borderWidth: 2,
            overflow: 'hidden',
          }}
          onPress={props.onPress}
        >
          {props.active && props.fill ? (
            <View style={{ flex: 1, backgroundColor: props.fill }} />
          ) : (
            <Svg width={size} height={size}>
              {wedges.map((w, i) => (
                <Path key={i} d={w.d} fill={w.fill} />
              ))}
            </Svg>
          )}
        </TouchableRipple>
      </View>
    </FocusRing>
  );
}

export default function ThemeChooser(props: ThemeChooserProps) {
  const { t } = useTranslate();
  const [selectedSeed, setSelectedSeed] = useState(props.seed);
  const [pickerOpen, setPickerOpen] = useState(false);

  const updateSeed = async (seed: ColorSchemeSeed) => {
    setSelectedSeed(seed);
    await sleep(ANIMATION_DURATION);
    props.onUpdateTheme(seed);
  };

  const canMatchWallpaper = Platform.OS === 'android' && isDynamicThemeSupported;
  // Without a wallpaper to match, a stored 'default' renders as vermilion (see useAppTheme), so it's shown
  // as the vermilion swatch rather than as a choice that isn't on offer.
  const shownSeed: ColorSchemeSeed = selectedSeed === 'default' && !canMatchWallpaper ? VERMILION : selectedSeed;
  const customSeed =
    shownSeed !== 'default' && !PRESETS.some((preset) => sameColor(shownSeed, preset.seed)) ? shownSeed : undefined;

  const renderColorBall = ({ item }: { item: (typeof PRESETS)[number] }) => (
    <ColorBall
      fill={item.fill}
      label={t(ACCENT_LABELS[item.key])}
      selected={sameColor(shownSeed, item.seed)}
      onPress={() => void updateSeed(item.seed)}
    />
  );

  const themeModeOptions: SelectPickerOption<ThemeMode>[] = [
    { value: 'system', label: t('settings.theme.mode.system') },
    { value: 'light', label: t('settings.theme.mode.light') },
    { value: 'dark', label: t('settings.theme.mode.dark') },
  ];

  return (
    <>
      <SegmentedGroup>
        <SegmentListFormElement
          label={t('settings.theme.title')}
          line2={
            <FlatList
              horizontal
              accessibilityRole="radiogroup"
              accessibilityLabel={t('settings.theme.title')}
              data={PRESETS}
              renderItem={renderColorBall}
              keyExtractor={(item) => item.key}
              showsHorizontalScrollIndicator={false}
              style={{ marginBlockStart: spacing[2] }}
              contentContainerStyle={{ gap: spacing[2], padding: spacing[2], alignItems: 'center' }}
              ListHeaderComponent={
                canMatchWallpaper ? (
                  <MatchWallpaperChip
                    label={t('settings.theme.match_wallpaper.label')}
                    selected={shownSeed === 'default'}
                    onPress={() => void updateSeed('default')}
                  />
                ) : null
              }
              ListFooterComponent={
                <CustomBall
                  label={t('settings.theme.custom.label')}
                  active={customSeed !== undefined}
                  fill={customSeed && accentTokens(customSeed, 'light').accent}
                  onPress={() => setPickerOpen(true)}
                />
              }
            />
          }
        />
        <SegmentedListSelect
          label={t('settings.theme.mode.label')}
          testID="setThemeMode"
          value={props.themeMode}
          options={themeModeOptions}
          onChange={props.setThemeMode}
        />
        <SegmentedListSwitch
          label={t('settings.app_configuration.true_black_dark_theme.title')}
          value={props.trueBlack}
          onValueChange={props.setTrueBlack}
        />
      </SegmentedGroup>
      <ColorPickerDialog
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        initialSeed={selectedSeed}
        onConfirm={(seed) => void updateSeed(seed)}
      />
    </>
  );
}
