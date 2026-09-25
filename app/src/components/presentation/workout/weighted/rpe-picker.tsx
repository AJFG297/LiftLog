import { spacing, useAppTheme } from '@/hooks/useAppTheme';
import { RPE_VALUES, Rpe } from '@/models/session-models/rpe';
import IconButton from '@/components/presentation/foundation/icon-button';
import Button from '@/components/presentation/foundation/button';
import { T, useTranslate } from '@tolgee/react';
import { View } from 'react-native';
import { Chip, Dialog, Portal } from 'react-native-paper';

interface RpeChipsProps {
  value: Rpe | undefined;
  onChange: (rpe: Rpe | undefined) => void;
}

/** One chip per RPE step, plus a clear button. Shared by the RPE picker and the long-press set dialog. */
export function RpeChips(props: RpeChipsProps) {
  const { colors } = useAppTheme();
  const { t } = useTranslate();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[1], alignItems: 'center' }}>
      {RPE_VALUES.map((rpe) => (
        <Chip key={rpe} testID={`rpe-${rpe}`} selected={props.value === rpe} onPress={() => props.onChange(rpe)}>
          {rpe}
        </Chip>
      ))}
      <IconButton
        mode="contained"
        iconColor={colors.error}
        containerColor={colors.errorContainer}
        icon={'close'}
        accessibilityLabel={t('workout.rpe.clear.button')}
        disabled={props.value === undefined}
        onPress={() => props.onChange(undefined)}
      />
    </View>
  );
}

interface RpePickerDialogProps {
  open: boolean;
  value: Rpe | undefined;
  onChange: (rpe: Rpe | undefined) => void;
  close: () => void;
}

/** Opened from a set tile's RPE row. Picking (or clearing) saves and closes straight away. */
export function RpePickerDialog(props: RpePickerDialogProps) {
  return (
    props.open && (
      <Portal>
        <Dialog visible={props.open} onDismiss={props.close}>
          <Dialog.Title>
            <T keyName="workout.rpe.title" />
          </Dialog.Title>
          <Dialog.Content>
            <RpeChips
              value={props.value}
              onChange={(rpe) => {
                props.onChange(rpe);
                props.close();
              }}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={props.close}>
              <T keyName="generic.cancel.button" />
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    )
  );
}
