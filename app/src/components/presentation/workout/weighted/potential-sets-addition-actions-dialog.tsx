import { numberStyle, spacing, useAppTheme } from '@/hooks/useAppTheme';
import { Dialog } from '@/components/presentation/foundation/dialog';
import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { TextField } from '@/components/presentation/foundation/text-field';
import { RpeChips } from '@/components/presentation/workout/weighted/rpe-picker';
import { Rpe } from '@/models/session-models/rpe';
import { PotentialSet } from '@/models/session-models';
import { T, useTranslate } from '@tolgee/react';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import IconButton from '@/components/presentation/foundation/icon-button';
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
  const { t } = useTranslate();
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
      <Dialog visible={open} onDismiss={close}>
        <Dialog.Title>
          <T keyName="exercise.select_reps.title" />
        </Dialog.Title>
        <Dialog.Content>
          <TextField
            label={<T keyName="exercise.reps.label" />}
            inputMode="numeric"
            value={repCountText}
            selectTextOnFocus
            error={!isValid}
            contentStyle={numberStyle}
            onChangeText={setRepCountText}
            autoFocus
          />

          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {Array.from({ length: repTarget + 3 }).map((_, i) => (
              <IconButton
                key={i}
                mode="outlined"
                icon={() => (
                  <SurfaceText font="text-sm" numeric>
                    {i}
                  </SurfaceText>
                )}
                accessibilityLabel={i.toString()}
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
              accessibilityLabel={t('generic.clear.button')}
              onPress={() => {
                setRepCountText('');
                updateRepCount(undefined);
                close();
              }}
            />
          </View>
          {updateRpe && (
            <View style={{ gap: spacing[2], marginTop: spacing[4] }}>
              <SurfaceText font="text-sm" weight="500">
                <T keyName="workout.rpe.label" />
              </SurfaceText>
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
    )
  );
}
