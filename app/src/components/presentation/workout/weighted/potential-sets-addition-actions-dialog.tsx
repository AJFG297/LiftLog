import { spacing, useAppTheme } from '@/hooks/useAppTheme';
import { RpeChips } from '@/components/presentation/workout/weighted/rpe-picker';
import { Rpe } from '@/models/session-models/rpe';
import { PotentialSet } from '@/models/session-models';
import { T } from '@tolgee/react';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import IconButton from '@/components/presentation/foundation/icon-button';
import { Dialog, Portal, Text, TextInput } from 'react-native-paper';
import Button from '@/components/presentation/foundation/button';

interface PotentialSetAdditionalActionsDialogProps {
  open: boolean;
  set: PotentialSet;
  repTarget: number;
  updateRepCount: (reps: number | undefined) => void;
  rpe: Rpe | undefined;
  /** `undefined` hides the RPE row (the Log RPE setting is off). */
  updateRpe: ((rpe: Rpe | undefined) => void) | undefined;
  close: () => void;
}

export default function PotentialSetAdditionalActionsDialog({
  close,
  open,
  set,
  updateRepCount,
  repTarget,
  rpe,
  updateRpe,
}: PotentialSetAdditionalActionsDialogProps) {
  const { colors } = useAppTheme();
  const originalReps = set?.set?.repsCompleted;

  const [repCountText, setRepCountText] = useState<string>(originalReps?.toString() ?? '');
  const parsedRepCount = Number(repCountText);
  const isValid = !repCountText || (Number.isInteger(parsedRepCount) && parsedRepCount >= 0);
  useEffect(() => {
    setRepCountText(originalReps?.toString() ?? '');
  }, [originalReps]);

  const save = () => {
    if (!isValid) {
      return;
    }

    updateRepCount(repCountText ? parsedRepCount : undefined);
    close();
  };
  return (
    open && (
      <Portal>
        <KeyboardAvoidingView behavior={'height'} style={{ flex: 1, pointerEvents: open ? 'box-none' : 'none' }}>
          <Dialog visible={open} onDismiss={close}>
            <Dialog.Title>
              <T keyName="exercise.select_reps.title" />
            </Dialog.Title>
            <Dialog.Content>
              <TextInput
                label={<T keyName="exercise.reps.label" />}
                inputMode="numeric"
                value={repCountText}
                selectTextOnFocus
                error={!isValid}
                onChangeText={setRepCountText}
                autoFocus
              />

              <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                {Array.from({ length: repTarget + 3 }).map((_, i) => (
                  <IconButton
                    key={i}
                    mode="outlined"
                    icon={() => <Text>{i}</Text>}
                    onPress={() => {
                      setRepCountText(i.toString());
                      updateRepCount(i);
                      close();
                    }}
                  />
                ))}
                <IconButton
                  mode="contained"
                  iconColor={colors.error}
                  containerColor={colors.errorContainer}
                  icon={'close'}
                  onPress={() => {
                    setRepCountText('');
                    updateRepCount(undefined);
                    close();
                  }}
                />
              </View>
              {updateRpe && (
                <View style={{ gap: spacing[2], marginTop: spacing[4] }}>
                  <Text variant="labelLarge">
                    <T keyName="workout.rpe.label" />
                  </Text>
                  {/* Unlike the rep buttons this doesn't close: RPE is set alongside the reps, not instead of them. */}
                  <RpeChips value={rpe} onChange={updateRpe} />
                </View>
              )}
            </Dialog.Content>
            <Dialog.Actions>
              <Button onPress={close}>{<T keyName="generic.cancel.button" />}</Button>
              <Button disabled={!isValid} onPress={save}>
                {<T keyName="generic.save.button" />}
              </Button>
            </Dialog.Actions>
          </Dialog>
        </KeyboardAvoidingView>
      </Portal>
    )
  );
}
