import Button from '@/components/presentation/foundation/button';
import { Dialog } from '@/components/presentation/foundation/dialog';
import { TextField } from '@/components/presentation/foundation/text-field';
import { T } from '@tolgee/react';
import { useEffect, useState } from 'react';

export default function RecordedExerciseNotesEditor(props: {
  exerciseName: string;
  open: boolean;
  notes: string | undefined;
  onUpdateNotes: (n: string) => void;
  onDismiss: () => void;
}) {
  const { open, notes, onUpdateNotes, onDismiss, exerciseName } = props;
  const [editorNotes, setEditorNotes] = useState(notes ?? '');

  useEffect(() => {
    setEditorNotes(notes || '');
  }, [notes]);
  return (
    open && (
      <Dialog visible={open} onDismiss={onDismiss}>
        <Dialog.Title>
          <T keyName="workout.notes_for.title" params={{ name: exerciseName }} />
        </Dialog.Title>
        <Dialog.Content>
          <TextField defaultValue={editorNotes} multiline numberOfLines={6} onChangeText={setEditorNotes} />
        </Dialog.Content>
        <Dialog.Actions>
          <Button
            testID="cancel-notes"
            onPress={() => {
              onDismiss();
              setEditorNotes(notes || '');
            }}
          >
            <T keyName="generic.cancel.button" />
          </Button>
          <Button
            testID="save-notes"
            onPress={() => {
              onUpdateNotes(editorNotes);
              onDismiss();
            }}
          >
            <T keyName="generic.save.button" />
          </Button>
        </Dialog.Actions>
      </Dialog>
    )
  );
}
