import FullHeightScrollView from '@/components/layout/full-height-scroll-view';
import { PageActions } from '@/components/presentation/foundation/page-actions';
import AssignmentAddIcon from '@expo/material-symbols/assignment_add.xml';
import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import SessionSummary from '@/components/presentation/summary/session-summary';
import SessionSummaryTitle from '@/components/presentation/summary/session-summary-title';
import { spacing } from '@/hooks/useAppTheme';
import { usePreferredWeightUnit } from '@/hooks/usePreferredWeightUnit';
import { Session } from '@/models/session-models';
import { useAppSelector } from '@/store';
import { clearPendingImport, linkPlanExercises, savePlan, selectPendingImport } from '@/store/program';
import { uuid } from '@/utils/uuid';
import { useTranslate } from '@tolgee/react';
import { Stack, useNavigation } from 'expo-router';
import { Fragment } from 'react';
import { View } from 'react-native';
import { useDispatch } from 'react-redux';
import { useOnDismiss } from '@/hooks/useOnDismiss';
import { useGoToRoutines } from '@/hooks/useGoToRoutines';
import { importScreensOnTop } from '@/models/home/go-to-routines';

export default function ImportPlan() {
  const pending = useAppSelector(selectPendingImport);
  const dispatch = useDispatch();
  const { t } = useTranslate();
  const navigation = useNavigation();
  const goToRoutines = useGoToRoutines();
  const preferredWeightUnit = usePreferredWeightUnit();

  useOnDismiss(() => dispatch(clearPendingImport()));

  const save = () => {
    if (!pending) {
      return;
    }
    const programId = uuid();
    dispatch(savePlan({ programId, programBlueprint: pending }));
    dispatch(linkPlanExercises({ programId }));
    // Leave the import screens first: the preview's dismiss clears the pending import, so it can't save the
    // plan twice and the next import is seen as new. Going to Routines can then be held up by an unsaved
    // routine editor underneath, and Keep editing returns to that editor rather than to an empty preview.
    const count = importScreensOnTop(navigation.getState()?.routes ?? []);
    if (count > 0) {
      navigation.dispatch({ type: 'POP', payload: { count } });
    }
    goToRoutines(programId);
  };

  return (
    <FullHeightScrollView
      floatingChildren={
        pending ? (
          <PageActions
            primaryKind="commit"
            primary={{
              label: t('plan.import.save.button'),
              icon: AssignmentAddIcon,
              systemImage: 'plus',
              onPress: save,
            }}
          />
        ) : undefined
      }
    >
      <Stack.Screen options={{ title: t('plan.import.title') }} />
      {pending && (
        <View style={{ gap: spacing[2], padding: spacing.pageHorizontalMargin }}>
          <SurfaceText font="text-2xl" weight="bold">
            {pending.name}
          </SurfaceText>
          {pending.sessions.map((session, i) => (
            <Fragment key={i}>
              <SessionSummaryTitle session={Session.getEmptySession(session, preferredWeightUnit)} />
              <SessionSummary session={Session.getEmptySession(session, preferredWeightUnit)} />
            </Fragment>
          ))}
        </View>
      )}
    </FullHeightScrollView>
  );
}
