import { Session } from '@/models/session-models';
import { useTranslate } from '@tolgee/react';
import { useEffect, useState } from 'react';
import { getSessionWorkoutEditorHref } from '@/components/smart/session-workout-editor';
import PageMenu from '@/components/presentation/foundation/page-menu';
import { Platform } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Jiggler } from '@/components/presentation/foundation/jiggler';
import IconButton from '@/components/presentation/foundation/icon-button';
import { MenuItem } from '@/components/presentation/foundation/menu';

export default function SessionMoreMenuComponent(props: {
  session: Session;
  isActiveWorkout?: boolean;
  save: () => void;
  /** Actions the screen adds below the ones every session has. */
  additionalItems?: MenuItem[];
}) {
  const { save, session, isActiveWorkout, additionalItems } = props;
  const { push } = useRouter();
  const { t } = useTranslate();

  const finishText = isActiveWorkout ? t('generic.finish.button') : t('generic.save.button');

  const handleEditWorkout = () => push(getSessionWorkoutEditorHref(session.id));

  return (
    <PageMenu
      testID="session-more"
      actions={Platform.select({
        // The toolbar reads its children natively, so this has to stay a literal toolbar button
        // rather than a component that renders one.
        ios: (
          <Stack.Toolbar.Button onPress={save}>
            <Stack.Toolbar.Label>{finishText}</Stack.Toolbar.Label>
          </Stack.Toolbar.Button>
        ),
        android: <AndroidFinishButton session={session} save={save} />,
      })}
      items={[
        {
          label: t('workout.edit.button'),
          icon: 'edit',
          systemImage: 'pencil',
          onPress: handleEditWorkout,
        },
        ...(additionalItems ?? []),
      ]}
    />
  );
}

function AndroidFinishButton({ session, save }: { session: Session; save: () => void }) {
  const { t } = useTranslate();

  const [jiggleFinishButton, setJiggleFinishButton] = useState(false);
  const isComplete = session.isComplete;
  const hasExercises = !!session.recordedExercises.length;

  useEffect(() => {
    const shouldJiggle = hasExercises && isComplete === true;
    setJiggleFinishButton(shouldJiggle);
    if (shouldJiggle) {
      const timeout = setTimeout(() => {
        setJiggleFinishButton(false);
      }, 10000);
      return () => clearTimeout(timeout);
    }
  }, [isComplete, hasExercises]);

  return (
    <Jiggler jiggling={jiggleFinishButton} jiggleSpeed={140}>
      <IconButton
        testID="finish-session-button"
        icon={'assignmentTurnedIn'}
        accessibilityLabel={t('workout.finish.action.tooltip')}
        onPress={save}
      />
    </Jiggler>
  );
}
