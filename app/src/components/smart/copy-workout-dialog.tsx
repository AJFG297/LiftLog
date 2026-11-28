import { spacing, useAppTheme } from '@/hooks/useAppTheme';
import { ProgramBlueprint, SessionBlueprint } from '@/models/blueprint-models';
import { useAppSelector } from '@/store';
import { showSnackbar } from '@/store/app';
import { addProgramSession, selectAllPrograms } from '@/store/program';
import { T, useTranslate } from '@tolgee/react';
import { useState } from 'react';
// RN's own list: a gesture-handler one needs its own root view to scroll inside the dialog's modal.
import { FlatList, Pressable, View } from 'react-native';
import { Dialog } from '@/components/presentation/foundation/dialog';
import { RadioMark } from '@/components/presentation/foundation/radio-mark';
import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { useDispatch } from 'react-redux';
import Button from '@/components/presentation/foundation/button';

type CopyWorkoutDialogProps = {
  visible: boolean;
  onDismiss: () => void;
  sessionBlueprint: SessionBlueprint;
  currentProgramId: string;
};

export default function CopyWorkoutDialog({
  visible,
  onDismiss,
  sessionBlueprint,
  currentProgramId,
}: CopyWorkoutDialogProps) {
  const dispatch = useDispatch();
  const { t } = useTranslate();
  const { tokens } = useAppTheme();
  const allPrograms = useAppSelector(selectAllPrograms);
  const [selectedProgramId, setSelectedProgramId] = useState<string>('');

  // Filter out the current program from the list
  const otherPrograms = allPrograms.filter(({ id }) => id !== currentProgramId);

  const handleCopy = () => {
    if (selectedProgramId) {
      const targetProgram = allPrograms.find(({ id }) => id === selectedProgramId);

      dispatch(
        addProgramSession({
          programId: selectedProgramId,
          sessionBlueprint: sessionBlueprint,
        }),
      );

      dispatch(
        showSnackbar({
          text: t('workout.copied_to_plan.message', {
            planName: targetProgram?.program.name,
          }),
        }),
      );

      onDismiss();
      setSelectedProgramId(''); // Reset selection
    }
  };

  const renderProgramItem = ({ item }: { item: { id: string; program: ProgramBlueprint } }) => (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selectedProgramId === item.id }}
      onPress={() => setSelectedProgramId(item.id)}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing[3],
        minHeight: 48,
        paddingVertical: spacing[2],
        borderRadius: 12,
        backgroundColor: pressed ? tokens.track : undefined,
      })}
    >
      <RadioMark selected={selectedProgramId === item.id} color={tokens.accentInk} dotColor={tokens.accent} />
      <SurfaceText font="text-base" style={{ flex: 1, color: tokens.ink }}>
        {item.program.name}
      </SurfaceText>
    </Pressable>
  );

  return (
    <Dialog visible={visible} onDismiss={onDismiss}>
      <Dialog.Title>
        <T keyName="workout.copy_to_plan.button" />
      </Dialog.Title>
      <Dialog.Content>
        <View style={{ gap: spacing[2] }}>
          <SurfaceText font="text-sm" style={{ color: tokens.ink }}>
            <T keyName="workout.copy_to_plan.select_plan.label" params={{ workoutName: sessionBlueprint.name }} />
          </SurfaceText>
          {otherPrograms.length === 0 ? (
            <SurfaceText font="text-sm" style={{ color: tokens.muted, fontStyle: 'italic' }}>
              <T keyName="plan.no_other_available.message" />
            </SurfaceText>
          ) : (
            <View style={{ maxHeight: 200 }}>
              <FlatList data={otherPrograms} keyExtractor={(item) => item.id} renderItem={renderProgramItem} />
            </View>
          )}
        </View>
      </Dialog.Content>
      <Dialog.Actions>
        <Button onPress={onDismiss}>
          <T keyName="generic.cancel.button" />
        </Button>
        <Button onPress={handleCopy} disabled={!selectedProgramId || otherPrograms.length === 0}>
          <T keyName="generic.copy.button" />
        </Button>
      </Dialog.Actions>
    </Dialog>
  );
}
