import Button from '@/components/presentation/foundation/button';
import { rounding, spacing, useAppTheme } from '@/hooks/useAppTheme';
import { Dialog } from '@/components/presentation/foundation/dialog';
import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { T } from '@tolgee/react';
import { ReactNode, useState } from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import TouchableRipple from '@/components/presentation/foundation/touchable-ripple';

const emptyDisplay = '-';

type CardioValueTileProps<T> = {
  value: T | undefined;
  format: (value: T) => string;
  label: string;
  dialogStyle?: ViewStyle;
  testID?: string;
} & (
  | {
      isReadonly: true;
      /** Seeds the editor when an empty tile is opened. */
      emptyValue?: T;
      onSave?: (value: T) => void;
      children?: (value: T, setValue: (value: T) => void) => ReactNode;
    }
  | {
      isReadonly?: false;
      emptyValue: T;
      onSave: (value: T) => void;
      children: (value: T, setValue: (value: T) => void) => ReactNode;
    }
);

export function CardioValueTile<T>({
  value,
  emptyValue,
  format,
  label,
  onSave,
  children,
  dialogStyle,
  testID,
  isReadonly,
}: CardioValueTileProps<T>) {
  const { colors } = useAppTheme();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogValue, setDialogValue] = useState<T | undefined>(value ?? emptyValue);
  const filled = value !== undefined;

  const face = (
    <View style={{ alignItems: 'center' }}>
      <SurfaceText
        font="text-xl"
        numeric
        style={[styles.centered, { color: filled ? colors.onSecondaryContainer : colors.outline }]}
      >
        {filled ? format(value) : emptyDisplay}
      </SurfaceText>
      <SurfaceText font="text-xs" style={[styles.centered, { color: colors.onSurfaceVariant }]}>
        {label}
      </SurfaceText>
    </View>
  );
  const tileStyle = [
    styles.tile,
    { backgroundColor: filled ? colors.secondaryContainer : colors.surfaceContainerHighest },
  ];

  // The seed colour is the user's and can land anywhere on the wheel, so filled and empty are
  // separated by a tonal step rather than by hue.
  return (
    <View style={{ borderRadius: rounding.roundedRectangleRadius, overflow: 'hidden' }}>
      {isReadonly ? (
        <View testID={testID} style={tileStyle}>
          {face}
        </View>
      ) : (
        <TouchableRipple
          testID={testID}
          onPress={() => {
            setDialogValue(value ?? emptyValue);
            setDialogOpen(true);
          }}
          style={tileStyle}
        >
          {face}
        </TouchableRipple>
      )}
      {dialogOpen && dialogValue !== undefined && (
        <Dialog visible={dialogOpen} onDismiss={() => setDialogOpen(false)}>
          <Dialog.Title>{label}</Dialog.Title>
          <Dialog.Content style={[{ flexDirection: 'row', alignItems: 'center' }, dialogStyle]}>
            {children?.(dialogValue, setDialogValue)}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setDialogOpen(false)}>
              <T keyName="generic.cancel.button" />
            </Button>
            <Button
              testID="cardio-value-save"
              onPress={() => {
                setDialogOpen(false);
                onSave?.(dialogValue);
              }}
            >
              <T keyName="generic.save.button" />
            </Button>
          </Dialog.Actions>
        </Dialog>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    minWidth: spacing[20],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    alignItems: 'center',
    justifyContent: 'center',
  },
  centered: {
    textAlign: 'center',
  },
});
