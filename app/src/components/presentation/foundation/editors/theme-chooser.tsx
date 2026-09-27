import FocusRing, { ANIMATION_DURATION } from '@/components/presentation/foundation/focus-ring';
import TouchableRipple from '@/components/presentation/foundation/touchable-ripple';
import { canMatchWallpaper, useAppTheme, spacing } from '@/hooks/useAppTheme';
import { ColorSchemeSeed, ThemeMode } from '@/store/settings';
import { hsvToHex, sameHex } from '@/utils/color';
import { sleep } from '@/utils/sleep';
import { ACCENT_PRESETS, accentFill, VERMILION } from '@/utils/theme-tokens';
import { useTranslate } from '@tolgee/react';
import { ReactNode, useState } from 'react';
import { View, ViewStyle } from 'react-native';
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

// Swatches show the fill the app will actually use, which can differ from the seed (see `accentFill`).
const PRESETS = ACCENT_PRESETS.map((preset) => ({ ...preset, fill: accentFill(preset.seed) }));

const SWATCH_SIZE = spacing[12];

// Many thin wedges make the hue transitions blend into a smooth conic gradient (SVG has no conic).
const HUE_WEDGES = (() => {
  const count = 180;
  const step = (2 * Math.PI) / count;
  const r = SWATCH_SIZE / 2;
  return Array.from({ length: count }, (_, i) => {
    const a0 = i * step - step;
    const a1 = (i + 1) * step + step;
    return {
      d: `M ${r} ${r} L ${r + r * Math.cos(a0)} ${r + r * Math.sin(a0)} A ${r} ${r} 0 0 1 ${r + r * Math.cos(a1)} ${r + r * Math.sin(a1)} Z`,
      fill: hsvToHex((i / count) * 360, 0.85, 1),
    };
  });
})();

/** One choice in the accent row: a pill-shaped radio with a focus ring when selected. */
function Swatch(props: {
  label: string;
  selected: boolean;
  onPress: () => void;
  style: ViewStyle;
  children?: ReactNode;
}) {
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
            borderRadius: SWATCH_SIZE,
            borderColor: tokens.line2,
            borderWidth: 2,
            overflow: 'hidden',
            ...props.style,
          }}
          onPress={props.onPress}
        >
          {props.children ?? <></>}
        </TouchableRipple>
      </View>
    </FocusRing>
  );
}

export default function ThemeChooser(props: ThemeChooserProps) {
  const { t } = useTranslate();
  const { tokens } = useAppTheme();
  const [selectedSeed, setSelectedSeed] = useState(props.seed);
  const [pickerOpen, setPickerOpen] = useState(false);

  const updateSeed = async (seed: ColorSchemeSeed) => {
    setSelectedSeed(seed);
    await sleep(ANIMATION_DURATION);
    props.onUpdateTheme(seed);
  };

  // Without a wallpaper to match, a stored 'default' renders as vermilion (see useAppTheme), so it's shown
  // as the vermilion swatch rather than as a choice that isn't on offer.
  const effectiveSeed: ColorSchemeSeed = selectedSeed === 'default' && !canMatchWallpaper ? VERMILION : selectedSeed;
  const customSeed =
    effectiveSeed !== 'default' && !PRESETS.some((preset) => sameHex(effectiveSeed, preset.seed))
      ? effectiveSeed
      : undefined;

  const renderPreset = ({ item }: { item: (typeof PRESETS)[number] }) => (
    <Swatch
      label={t(`settings.theme.accent.${item.key}.label`)}
      selected={sameHex(effectiveSeed, item.seed)}
      onPress={() => void updateSeed(item.seed)}
      style={{ width: SWATCH_SIZE, backgroundColor: item.fill }}
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
              renderItem={renderPreset}
              keyExtractor={(item) => item.key}
              showsHorizontalScrollIndicator={false}
              style={{ marginBlockStart: spacing[2] }}
              contentContainerStyle={{ gap: spacing[2], padding: spacing[2], alignItems: 'center' }}
              ListHeaderComponent={
                canMatchWallpaper ? (
                  <Swatch
                    label={t('settings.theme.match_wallpaper.label')}
                    selected={effectiveSeed === 'default'}
                    onPress={() => void updateSeed('default')}
                    style={{ paddingHorizontal: spacing[4], justifyContent: 'center' }}
                  >
                    <SurfaceText font="text-sm" weight="600" style={{ color: tokens.ink }}>
                      {t('settings.theme.match_wallpaper.label')}
                    </SurfaceText>
                  </Swatch>
                ) : null
              }
              ListFooterComponent={
                <Swatch
                  label={t('settings.theme.custom.title')}
                  selected={customSeed !== undefined}
                  onPress={() => setPickerOpen(true)}
                  style={{ width: SWATCH_SIZE }}
                >
                  {customSeed ? (
                    <View style={{ flex: 1, backgroundColor: accentFill(customSeed) }} />
                  ) : (
                    <Svg width={SWATCH_SIZE} height={SWATCH_SIZE}>
                      {HUE_WEDGES.map((w, i) => (
                        <Path key={i} d={w.d} fill={w.fill} />
                      ))}
                    </Svg>
                  )}
                </Swatch>
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
