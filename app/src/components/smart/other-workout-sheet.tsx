import { ListRow } from '@/components/presentation/foundation/list-row';
import { MsIconSrc } from '@/components/presentation/foundation/ms-icon-source';
import { SheetHeader } from '@/components/presentation/foundation/sheet-header';
import { upNextDetailText } from '@/components/smart/up-next-text';
import { spacing, useAppTheme } from '@/hooks/useAppTheme';
import { useFormatDate } from '@/hooks/useFormatDate';
import { useStartWorkoutWithConfirmation } from '@/hooks/useStartWorkoutWithConfirmation';
import { useToday } from '@/hooks/useToday';
import { routineColorOf } from '@/models/home/routine-colors';
import { useAppSelector } from '@/store';
import { selectActiveProgram } from '@/store/program';
import { selectSessions } from '@/store/stored-sessions';
import { useTranslate } from '@tolgee/react';
import { useNavigation, useRouter } from 'expo-router';
import { useGoToRoutines } from '@/hooks/useGoToRoutines';
import { View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Home's Other: the active plan's workouts other than Up next, each started with one tap, then the
 * Routines tab for everything else.
 */
export function OtherWorkoutSheet() {
  const { t } = useTranslate();
  const { tokens } = useAppTheme();
  const { back } = useRouter();
  const navigation = useNavigation();
  const goToRoutines = useGoToRoutines();
  const insets = useSafeAreaInsets();
  const formatDate = useFormatDate();
  const today = useToday();
  const plan = useAppSelector(selectActiveProgram);
  const sessions = useAppSelector(selectSessions);
  // The first is Home's Up next card; this sheet is for the rest.
  const others = useAppSelector((x) => x.program.upcomingSessions)
    .map((x) => x.slice(1))
    .unwrapOr([]);
  const { start, confirmationDialog } = useStartWorkoutWithConfirmation({ onStarted: () => back() });
  const planWorkoutNames = plan?.sessions.map((x) => x.name) ?? [];

  return (
    <View
      testID="other-workout-sheet"
      style={{ flex: 1, backgroundColor: tokens.card, paddingHorizontal: spacing.pageHorizontalMargin }}
    >
      <SheetHeader title={t('home.other.title')} subtitle={plan?.name} onClose={back} />
      <ScrollView contentContainerStyle={{ gap: spacing[1], paddingBottom: insets.bottom + spacing[4] }}>
        {others.map((session, index) => (
          <ListRow
            key={session.id}
            testID={`other-workout-${index}`}
            title={session.blueprint.name}
            subtitle={upNextDetailText(t, session, sessions, today, formatDate)}
            accessibilityLabel={t('home.up_next.start.button', { name: session.blueprint.name })}
            leading={
              <View
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 4,
                  backgroundColor: routineColorOf(session.blueprint.name, planWorkoutNames),
                }}
              />
            }
            trailing={<MsIconSrc name="playArrow" size={22} color={tokens.accentInk} />}
            onPress={() => start(session)}
            style={{ borderRadius: 16 }}
          />
        ))}
        <ListRow
          testID="other-workout-routines"
          title={t('home.other.routines.button')}
          leading={<MsIconSrc name="assignment" size={20} color={tokens.muted} />}
          trailing={<MsIconSrc name="chevronRight" size={22} color={tokens.muted} />}
          onPress={() => {
            // Closed right away rather than through the router's queue, which would run after the tab
            // switch and go back from Routines instead.
            navigation.goBack();
            goToRoutines();
          }}
          style={{ borderRadius: 16 }}
        />
      </ScrollView>
      {confirmationDialog}
    </View>
  );
}
