import Menu from '@/components/presentation/foundation/menu';
import { MsIconSrc } from '@/components/presentation/foundation/ms-icon-source';
import { MIN_TOUCH_TARGET } from '@/components/presentation/foundation/touch-target';
import { WorkoutInProgressBar } from '@/components/presentation/home/workout-in-progress-bar';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useLiveWorkoutFocus } from '@/hooks/useLiveWorkoutFocus';
import { resumeWorkoutActions } from '@/models/home/resume-workout';
import { showsWorkoutInProgressBar } from '@/models/home/workout-bar-visibility';
import { workoutInProgressNextOf, WorkoutInProgressNext } from '@/models/home/workout-in-progress';
import { Session } from '@/models/session-models';
import { restWindowOf } from '@/models/session-models/rest';
import { useAppSelector, useAppSelectorWhenFocused } from '@/store';
import { fetchUpcomingSessions } from '@/store/program';
import { deleteStoredSession, selectActiveSession } from '@/store/stored-sessions';
import { useTranslate } from '@tolgee/react';
import { useNavigationContainerRef, useRootNavigationState, useRoute, useRouter } from 'expo-router';
import { ReactNode } from 'react';
import { Alert, Platform, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDispatch } from 'react-redux';

type TranslateFn = ReturnType<typeof useTranslate>['t'];

/**
 * A tab's content with the workout-in-progress bar under it, just above the tab bar. Every tab's layout
 * wraps its stack in this, so the bar shows whichever tab is open. The bar takes its own space rather
 * than floating, so it never covers a screen's content or its bottom buttons.
 */
export function WithWorkoutInProgressBar({ children }: { children: ReactNode }) {
  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>{children}</View>
      <WorkoutInProgress />
    </View>
  );
}

function WorkoutInProgress() {
  // Tabs behind the open one stay mounted; they needn't follow every logged set.
  const session = useAppSelectorWhenFocused(selectActiveSession);
  // This sits in a tab's layout, outside its stack, so the route is the tab's own.
  const tab = useRoute();
  const root = useRootNavigationState();
  // Hidden while the tab shows the workout or one of its sheets, including while a screen over the tabs
  // opens or closes on top of it.
  if (!showsWorkoutInProgressBar(root, tab.key, session !== undefined) || !session) {
    return null;
  }
  return <Bar session={session} />;
}

function Bar({ session }: { session: Session }) {
  const { t } = useTranslate();
  const { tokens } = useAppTheme();
  const { push } = useRouter();
  const navigation = useNavigationContainerRef();
  const dispatch = useDispatch();
  const restTimersEnabled = useAppSelector((x) => x.settings.restTimersEnabled);
  const { groups, focusedGroupIndex } = useLiveWorkoutFocus(session);
  // iOS tab content runs under the translucent tab bar, and each tab has its own safe-area provider whose
  // bottom inset is the tab bar's height. Android lays the tab bar out below the content instead.
  const insets = useSafeAreaInsets();

  // The page on screen is kept in the store, so the workout opens where it was left.
  const resume = () => {
    const actions = resumeWorkoutActions(navigation.getRootState());
    if (!actions) {
      push('/(tabs)/(session)/session', { withAnchor: true });
      return;
    }
    for (const action of actions) {
      navigation.dispatch(action);
    }
  };
  const clear = () =>
    Alert.alert(t('workout.clear_current.confirm.title'), t('workout.clear_current.confirm.body'), [
      { text: t('generic.cancel.button'), style: 'cancel' },
      {
        text: t('generic.clear.button'),
        style: 'destructive',
        onPress: () => {
          dispatch(deleteStoredSession(session.id));
          dispatch(fetchUpcomingSessions());
        },
      },
    ]);

  return (
    <WorkoutInProgressBar
      workoutName={session.blueprint.name}
      startTime={session.startTime}
      nextText={nextText(t, workoutInProgressNextOf(session, groups, focusedGroupIndex))}
      restWindow={restTimersEnabled ? restWindowOf(session) : undefined}
      restOverText={t('in_progress_bar.rest_over.button')}
      onResume={resume}
      bottomInset={Platform.OS === 'ios' ? insets.bottom : 0}
      menu={
        <Menu
          size={MIN_TOUCH_TARGET}
          items={[
            { label: t('workout.resume.button'), icon: 'playArrow', systemImage: 'play', onPress: resume },
            {
              label: t('workout.clear_current.button'),
              icon: 'delete',
              systemImage: 'trash',
              destructive: true,
              onPress: clear,
            },
          ]}
          trigger={(open) => (
            <Pressable
              testID="workout-in-progress-more"
              onPress={open}
              accessibilityRole="button"
              accessibilityLabel={t('in_progress_bar.more.button')}
              style={{
                width: MIN_TOUCH_TARGET,
                height: MIN_TOUCH_TARGET,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <MsIconSrc name="moreHoriz" size={22} color={tokens.inverseMuted} />
            </Pressable>
          )}
        />
      }
    />
  );
}

function nextText(t: TranslateFn, next: WorkoutInProgressNext): string {
  switch (next.kind) {
    case 'set':
      return nextSetText(t, next);
    case 'page':
      return t('in_progress_bar.next_page.label', { names: next.exerciseNames.join(' + ') });
    case 'finish':
      return t('in_progress_bar.finish.label');
  }
}

function nextSetText(t: TranslateFn, next: Extract<WorkoutInProgressNext, { kind: 'set' }>): string {
  const name = next.exerciseName;
  switch (next.set.kind) {
    case 'working':
      return t('in_progress_bar.next_working.label', {
        name,
        number: next.set.number.toString(),
        total: next.workingSets.toString(),
      });
    case 'warmup':
      return t('in_progress_bar.next_warmup.label', { name });
    case 'drop':
      return t('in_progress_bar.next_drop.label', { name });
    case 'myo':
      return t('in_progress_bar.next_myo.label', { name });
    case 'failure':
      return t('in_progress_bar.next_failure.label', { name });
  }
}
