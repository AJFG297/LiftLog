import { Card, Icon, Text } from 'react-native-paper';
import { View } from 'react-native';
import EmptyInfo from '@/components/presentation/foundation/empty-info';
import { useAppTheme, spacing, font, tabularText } from '@/hooks/useAppTheme';
import { T, useTranslate } from '@tolgee/react';
import ItemList from '@/components/presentation/foundation/item-list';
import { RecordedExercise, Session } from '@/models/session-models';
import WeightDisplay from '@/components/presentation/foundation/editors/weight-display';
import BigNumber from 'bignumber.js';
import { ReactNode } from 'react';
import FullHeightScrollView from '@/components/layout/full-height-scroll-view';
import { PageActions } from '@/components/presentation/foundation/page-actions';
import AddIcon from '@expo/material-symbols/add.xml';
import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import WeightFormat from '../presentation/foundation/weight-format';
import { formatDuration } from '@/utils/format-date';
import { useAddExercise } from '@/hooks/useAddExercise';
import { PreviousPerformancesProvider, useHasPreviousPerformances } from '@/components/smart/previous-performances';
import { RecordedExerciseView } from '@/components/smart/recorded-exercise-view';

export default function SessionComponent(props: {
  session: Session;
  /**
   * Takes a reducer rather than a value so consecutive edits compose against whatever the owner
   * currently holds. Omit it for a session the user does not own, which makes the screen read-only.
   */
  updateSession?: (update: (session: Session) => Session) => void;
  showBodyweight: boolean;
  header?: ReactNode;
}) {
  const { session } = props;
  const { colors } = useAppTheme();
  const { t } = useTranslate();
  const isReadonly = !props.updateSession;
  const editableSessionId = isReadonly ? undefined : session.id;
  const addExercise = useAddExercise(editableSessionId);
  const hasPreviousPerformances = useHasPreviousPerformances();
  const updateSession = (reducer: (session: Session) => Session) => props.updateSession?.(reducer);

  const notesComponent = session.blueprint.notes ? (
    <Card
      mode="contained"
      style={{
        marginVertical: spacing[2],
        marginHorizontal: spacing.pageHorizontalMargin,
      }}
    >
      <Card.Content
        style={{
          gap: spacing[4],
          flexDirection: 'row',
          alignItems: 'center',
        }}
      >
        <Icon source={'text'} size={20} />
        <View style={{ paddingRight: spacing[2] }}>
          <SurfaceText>{session.blueprint.notes}</SurfaceText>
        </View>
      </Card.Content>
    </Card>
  ) : null;

  const emptyInfo =
    session.recordedExercises.length === 0 ? (
      <EmptyInfo style={{ marginVertical: spacing[8] }}>
        <SurfaceText>
          {t('workout.contains_no_exercises.message')} {'\n'}
        </SurfaceText>
        <SurfaceText>{t('exercise.add_hint.body')}</SurfaceText>
      </EmptyInfo>
    ) : null;

  const renderItem = (item: RecordedExercise, index: number) => (
    <RecordedExerciseView
      session={session}
      exerciseIndex={index}
      updateSession={props.updateSession}
      toStartNext={session.nextExercise === item}
    />
  );

  const bodyweight = props.showBodyweight ? (
    <Card style={{ marginHorizontal: spacing.pageHorizontalMargin }} mode="contained" testID="bodyweight-card">
      <Card.Content
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Text
          style={{
            ...font['text-xl'],
            fontWeight: 'bold',
            color: colors.onSurface,
          }}
        >
          {t('exercise.bodyweight.label')}
        </Text>
        <WeightDisplay
          allowNull={true}
          weight={session.bodyweight}
          updateWeight={(bodyweight) => updateSession((s) => s.with({ bodyweight }))}
          increment={new BigNumber('0.1')}
          label={t('exercise.bodyweight.label')}
        />
      </Card.Content>
    </Card>
  ) : null;

  const floatingBottomContainer = isReadonly ? null : (
    <PageActions
      primaryExpanded
      primary={{
        label: t('exercise.add.title'),
        icon: AddIcon,
        systemImage: 'plus',
        onPress: addExercise,
      }}
    />
  );

  const workoutSummary = (
    <Card mode="contained" style={{ margin: spacing.pageHorizontalMargin }}>
      <Card.Content>
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <Text variant="bodyMedium">
            <T keyName="workout.total_weight_lifted.label" />
          </Text>
          <WeightFormat fontWeight="bold" color="primary" weight={session.totalWeightLifted} decimalPlaces={0} />
        </View>
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <Text variant="bodyMedium">
            <T keyName="workout.total_time.label" />
          </Text>
          <Text variant="bodyMedium" style={{ ...tabularText, color: colors.primary, fontWeight: 'bold' }}>
            {(session.duration && formatDuration(session.duration, 'hours-mins')) || '-'}
          </Text>
        </View>
      </Card.Content>
    </Card>
  );

  const content = (
    <FullHeightScrollView floatingChildren={floatingBottomContainer}>
      {props.header}
      {notesComponent}
      {emptyInfo}
      <ItemList items={session.recordedExercises} renderItem={renderItem} />
      {bodyweight}
      {workoutSummary}
    </FullHeightScrollView>
  );
  // "Last time" for the exercises: loaded here for a screen of one session, or once above for several.
  return hasPreviousPerformances ? (
    content
  ) : (
    <PreviousPerformancesProvider session={session}>{content}</PreviousPerformancesProvider>
  );
}
