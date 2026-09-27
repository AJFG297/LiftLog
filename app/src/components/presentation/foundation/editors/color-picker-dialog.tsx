import Button from '@/components/presentation/foundation/button';
import { ColorSliders } from '@/components/presentation/foundation/editors/color-sliders';
import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { spacing, useAppTheme } from '@/hooks/useAppTheme';
import { ColorSchemeSeed } from '@/store/settings';
import { type HexColor } from '@/utils/color';
import { accentTokens } from '@/utils/theme-tokens';
import { T } from '@tolgee/react';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Dialog, Portal } from 'react-native-paper';

interface ColorPickerDialogProps {
  open: boolean;
  onClose: () => void;
  initialSeed: ColorSchemeSeed;
  onConfirm: (seed: HexColor) => void;
}

export default function ColorPickerDialog(props: ColorPickerDialogProps) {
  const { tokens } = useAppTheme();
  const fallback = tokens.accent;
  const [draft, setDraft] = useState<HexColor>(props.initialSeed === 'default' ? fallback : props.initialSeed);

  useEffect(() => {
    if (props.open) {
      setDraft(props.initialSeed === 'default' ? fallback : props.initialSeed);
    }
    // Only reset when the dialog is (re)opened, not on every theme tick.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [props.open]);

  if (!props.open) {
    return null;
  }

  return (
    <Portal>
      <Dialog visible={props.open} onDismiss={props.onClose}>
        <Dialog.Title>
          <T keyName="settings.theme.custom.title" />
        </Dialog.Title>
        <Dialog.Content>
          <View style={{ gap: spacing[5] }}>
            <ColorSliders value={draft} onChange={setDraft} />
            <AccentPreview seed={draft} />
          </View>
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={props.onClose} testID="color-picker-close">
            <T keyName="generic.close.button" />
          </Button>
          <Button
            testID="color-picker-save"
            onPress={() => {
              props.onConfirm(draft);
              props.onClose();
            }}
          >
            <T keyName="generic.save.button" />
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

/**
 * Shows the accent the seed generates, so its effect is visible before committing: the fill (the same in
 * every mode) and the tints derived from it for the current mode.
 */
function AccentPreview({ seed }: { seed: HexColor }) {
  const { tokens, colorScheme } = useAppTheme();
  const accent = accentTokens(seed, colorScheme);
  // The tints are close to the dialog's own colour by design, so each swatch gets a hairline.
  const swatch = { height: spacing[10], borderRadius: spacing[2], borderWidth: 1, borderColor: tokens.line2 };

  return (
    <View
      style={{
        backgroundColor: tokens.bg,
        borderRadius: spacing[3],
        padding: spacing[4],
        gap: spacing[3],
      }}
    >
      <SurfaceText font="text-sm" weight="600" color="onSurfaceVariant">
        <T keyName="settings.theme.custom.preview" />
      </SurfaceText>
      <View style={{ flexDirection: 'row', gap: spacing[2] }}>
        <View style={{ ...swatch, flex: 2, backgroundColor: accent.accent }} />
        <View style={{ ...swatch, flex: 1, backgroundColor: accent.accentSoft }} />
        <View style={{ ...swatch, flex: 1, backgroundColor: accent.wash }} />
      </View>
      <SurfaceText font="text-xs" color="onSurfaceVariant">
        <T keyName="settings.theme.custom.contrast.body" />
      </SurfaceText>
    </View>
  );
}
