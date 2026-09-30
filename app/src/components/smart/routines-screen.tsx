import { MsIconSrc, type AppIconName } from '@/components/presentation/foundation/ms-icon-source';
import { ProgressBar } from '@/components/presentation/foundation/progress-bar';
import { RoundIconButton } from '@/components/presentation/foundation/round-icon-button';
import SelectPicker from '@/components/presentation/foundation/select-picker';
import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { MIN_TOUCH_TARGET } from '@/components/presentation/foundation/touch-target';
import { RoutineColorDot } from '@/components/presentation/workout-editor/routine-color-swatches';
import {
  daysAgoOf,
  estimatedMinutesOf,
  lastDoneByRoutineName,
  workoutsDoneOf,
} from '@/components/presentation/workout-editor/routine-summary';
import { programHref, ProgramListItem, programSummary } from '@/components/smart/program-list-item';
import { useServices } from '@/components/smart/services-provider';
import { useFormatDate } from '@/hooks/useFormatDate';
import { spacing, useAppTheme } from '@/hooks/useAppTheme';
import { useStartWorkoutWithConfirmation } from '@/hooks/useStartWorkoutWithConfirmation';
import { ProgramBlueprint, SessionBlueprint } from '@/models/blueprint-models';
import { BuiltInPrograms } from '@/models/built-in-programs';
import { Session } from '@/models/session-models';
import { useAppSelector } from '@/store';
import { fetchUpcomingSessions, linkPlanExercises, savePlan, selectAllPrograms } from '@/store/program';
import { setPlansSortOrder } from '@/store/settings';
import { selectLatestExercises, selectSessions } from '@/store/stored-sessions';
import { uuid } from '@/utils/uuid';
import { LocalDate } from '@js-joda/core';
import { useTranslate } from '@tolgee/react';
import { type Href, Stack, useFocusEffect, useRouter } from 'expo-router';
import { type ReactNode, useEffect } from 'react';
import { Pressable, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDispatch } from 'react-redux';

type TranslateFn = ReturnType<typeof useTranslate>['t'];

/** Where a routine is edited: an existing one by its place in the program, a new one at the end. */
export function routineEditorHref(programId: string, sessionIndex: number, options?: { isNew?: boolean }): Href {
  return `/settings/manage-workouts/${programId}/manage-session/${sessionIndex}${options?.isNew ? '?new=1' : ''}` as Href;
}

/**
 * The Routines screen (plan decision D4): the active program with its next workout, that program's routines,
 * an empty workout, the other saved programs and the built-in library. Every control sits in the scrolling
 * content, so nothing floats over a row to take its taps, and making another program active always asks
 * first.
 */
export function RoutinesScreen({ focusProgramId }: { focusProgramId?: string }) {
  const { t } = useTranslate();
  const { tokens } = useAppTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const dispatch = useDispatch();
  const { sessionService } = useServices();
  const programs = useAppSelector(selectAllPrograms);
  const activePlanId = useAppSelector((x) => x.program.activePlanId);
  const savedPrograms = useAppSelector((x) => x.program.savedPrograms);
  const sortOrder = useAppSelector((x) => x.settings.plansSortOrder);
  const upcoming = useAppSelector((x) => x.program.upcomingSessions);
  const sessions = useAppSelector(selectSessions);
  const latestExercises = useAppSelector(selectLatestExercises);
  const { start, confirmationDialog } = useStartWorkoutWithConfirmation();
  const active = savedPrograms[activePlanId];

  useFocusEffect(() => {
    dispatch(fetchUpcomingSessions());
  });
  // Switching or editing the active program here changes what's next without the screen losing focus.
  useEffect(() => {
    dispatch(fetchUpcomingSessions());
  }, [active, dispatch]);

  const lastDone = lastDoneByRoutineName(sessions);
  const nextSession = upcoming.isSuccess() ? upcoming.data[0] : undefined;
  const bodyweight = nextSession?.bodyweight;

  const startRoutine = (routine: SessionBlueprint) => {
    const session =
      nextSession && nextSession.blueprint.equals(routine)
        ? nextSession
        : sessionService.hydrateSessionFromBlueprint(routine, latestExercises).with({ bodyweight });
    start(session);
  };

  const newRoutine = () => {
    if (active) {
      router.push(routineEditorHref(activePlanId, active.sessions.length, { isNew: true }));
    }
  };

  const newProgram = () => {
    const programId = uuid();
    dispatch(
      savePlan({
        programId,
        programBlueprint: new ProgramBlueprint(t('plan.new_default_name.label'), [], LocalDate.now()),
      }),
    );
    router.push(programHref(programId));
  };

  const openBuiltIn = (programId: string) => {
    const builtIn = BuiltInPrograms[programId];
    if (!savedPrograms[programId] && builtIn) {
      dispatch(savePlan({ programId, programBlueprint: builtIn }));
      dispatch(linkPlanExercises({ programId }));
    }
    router.push(programHref(programId));
  };

  const others = programs.filter(({ id }) => id !== activePlanId);
  if (sortOrder === 'recent') {
    others.sort((a, b) => b.program.lastEdited.compareTo(a.program.lastEdited));
  }

  return (
    <View style={{ flex: 1, backgroundColor: tokens.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView
        testID="routines-screen"
        contentContainerStyle={{
          paddingTop: insets.top + spacing[3],
          paddingHorizontal: spacing.pageHorizontalMargin,
          paddingBottom: spacing[10],
          gap: spacing[5],
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[1] }}>
          {router.canGoBack() ? (
            <RoundIconButton
              icon="chevronLeft"
              size="compact"
              accessibilityLabel={t('routines.back.button')}
              onPress={() => router.back()}
            />
          ) : null}
          <SurfaceText
            font="text-3xl"
            weight="700"
            accessibilityRole="header"
            style={{ flex: 1, color: tokens.ink, letterSpacing: -0.6, paddingLeft: spacing[1] }}
          >
            {t('routines.title')}
          </SurfaceText>
          {active ? (
            <RoundIconButton
              testID="routines-new-routine"
              icon="add"
              accessibilityLabel={t('routines.new_routine.button')}
              onPress={newRoutine}
            />
          ) : null}
        </View>

        {active ? (
          <ActiveProgramCard
            programId={activePlanId}
            program={active}
            next={nextSession}
            lastDone={lastDone}
            workoutsDone={workoutsDoneOf(
              sessions,
              active.sessions.map((routine) => routine.name),
            )}
            onStart={() => nextSession && start(nextSession)}
            onAddRoutine={newRoutine}
          />
        ) : null}

        {active && active.sessions.length ? (
          <Section
            title={t('routines.my_routines.title')}
            action={{ label: t('routines.new_routine.button'), onPress: newRoutine }}
          >
            {active.sessions.map((routine, index) => (
              <RoutineRow
                key={`${index}-${routine.name}`}
                routine={routine}
                index={index}
                lastDone={lastDone.get(routine.name)}
                onEdit={() => router.push(routineEditorHref(activePlanId, index))}
                onStart={() => startRoutine(routine)}
              />
            ))}
          </Section>
        ) : null}

        <DashedButton
          testID="routines-empty-workout"
          icon="add"
          label={t('routines.empty_workout.button')}
          onPress={() => start(Session.freeformSession(LocalDate.now(), bodyweight))}
        />

        <Section title={t('routines.other_programs.title')}>
          {others.length > 1 ? (
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
              <SelectPicker
                value={sortOrder}
                options={[
                  { value: 'name', label: t('plan.sort.name') },
                  { value: 'recent', label: t('plan.sort.recent') },
                ]}
                onChange={(value) => dispatch(setPlansSortOrder(value))}
              />
            </View>
          ) : null}
          {others.map(({ id }) => (
            <ProgramListItem key={id} id={id} isFocused={focusProgramId === id} />
          ))}
          <View style={{ flexDirection: 'row', gap: spacing[2] }}>
            <OutlinedButton
              testID="routines-new-program"
              icon="add"
              label={t('routines.new_program.button')}
              onPress={newProgram}
            />
            <OutlinedButton
              icon="download"
              label={t('routines.import_program.button')}
              onPress={() => router.push('/settings/import-plan-info')}
            />
          </View>
        </Section>

        <Section title={t('routines.find_program.title')}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
            {Object.entries(BuiltInPrograms).map(([id, program]) => (
              <LibraryTile
                key={id}
                title={program.name}
                subtitle={t(program.sessions.length === 1 ? 'plan.summary.day' : 'plan.summary.days', {
                  count: program.sessions.length,
                })}
                onPress={() => openBuiltIn(id)}
              />
            ))}
            <LibraryTile
              accent
              icon="promptSuggestion"
              title={t('routines.build_ai.title')}
              subtitle={t('routines.build_ai.body')}
              onPress={() => router.push('/settings/ai/planner')}
            />
          </View>
        </Section>
      </ScrollView>
      {confirmationDialog}
    </View>
  );
}

function ActiveProgramCard(props: {
  programId: string;
  program: ProgramBlueprint;
  next: Session | undefined;
  lastDone: Map<string, LocalDate>;
  workoutsDone: number;
  onStart: () => void;
  onAddRoutine: () => void;
}) {
  const { t } = useTranslate();
  const { tokens } = useAppTheme();
  const router = useRouter();
  const formatDate = useFormatDate();
  const { program, next } = props;
  const nextIndex = next ? program.sessions.findIndex((s) => s.equals(next.blueprint)) : -1;
  const count = program.sessions.length;
  // Programs repeat with no set length, so progress is the place in the current round of routines.
  const progress =
    nextIndex >= 0
      ? [
          t('routines.active_program.day.label', { day: nextIndex + 1, count }),
          ...(props.workoutsDone
            ? [
                t(
                  props.workoutsDone === 1
                    ? 'routines.active_program.done_one.label'
                    : 'routines.active_program.done_many.label',
                  { count: props.workoutsDone },
                ),
              ]
            : []),
        ].join(' · ')
      : undefined;

  return (
    <View
      testID="active-program-card"
      style={{ backgroundColor: tokens.inverse, borderRadius: 20, padding: spacing[4], gap: spacing[3] }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing[2] }}>
        <View style={{ flex: 1, gap: spacing[1] }}>
          <SurfaceText
            font="text-xs"
            weight="600"
            style={{ color: tokens.inverseMuted, textTransform: 'uppercase', letterSpacing: 1 }}
          >
            {t('routines.active_program.label')}
          </SurfaceText>
          <SurfaceText font="text-xl" weight="700" style={{ color: tokens.inverseInk }}>
            {program.name}
          </SurfaceText>
          <SurfaceText testID="active-program-progress" font="text-sm" style={{ color: tokens.inverseMuted }}>
            {progress ?? programSummary(t, program)}
          </SurfaceText>
        </View>
        <Pressable
          testID="active-program-edit"
          onPress={() => router.push(programHref(props.programId))}
          accessibilityRole="button"
          accessibilityLabel={t('routines.active_program.edit.label', { name: program.name })}
          style={{ minHeight: MIN_TOUCH_TARGET, justifyContent: 'center' }}
        >
          {({ pressed }) => (
            <View
              style={{
                borderWidth: 1,
                borderColor: tokens.inverseTrack,
                borderRadius: 10,
                paddingHorizontal: spacing[3],
                paddingVertical: spacing[1],
                backgroundColor: pressed ? tokens.inverseRaised : undefined,
              }}
            >
              <SurfaceText font="text-sm" weight="600" style={{ color: tokens.inverseInk }}>
                {t('generic.edit.button')}
              </SurfaceText>
            </View>
          )}
        </Pressable>
      </View>

      {progress ? (
        <ProgressBar
          tone="inverse"
          height={6}
          progress={nextIndex / count}
          accessibilityLabel={t('routines.active_program.round.label')}
        />
      ) : null}

      {program.sessions.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
          {program.sessions.map((routine, index) => {
            const isNext = index === nextIndex;
            const done = props.lastDone.get(routine.name);
            return (
              <View
                key={`${index}-${routine.name}`}
                accessible
                accessibilityLabel={
                  isNext
                    ? t('routines.active_program.next_tile.label', { name: routine.name })
                    : `${routine.name}, ${lastDoneText(t, formatDate, done)}`
                }
                style={{
                  flexBasis: '30%',
                  flexGrow: 1,
                  borderRadius: 12,
                  padding: spacing[3],
                  gap: spacing[0.5],
                  backgroundColor: isNext ? tokens.bg : tokens.inverseRaised,
                }}
              >
                <SurfaceText
                  font="text-xs"
                  weight={isNext ? '700' : '600'}
                  numberOfLines={1}
                  style={{
                    color: isNext ? tokens.accentInk : tokens.inverseMuted,
                    textTransform: isNext ? 'uppercase' : 'none',
                    letterSpacing: isNext ? 0.7 : 0,
                  }}
                >
                  {isNext ? t('routines.active_program.next.label') : lastDoneText(t, formatDate, done)}
                </SurfaceText>
                <SurfaceText
                  font="text-base"
                  weight="600"
                  numberOfLines={1}
                  style={{ color: isNext ? tokens.ink : tokens.inverseInk }}
                >
                  {routine.name}
                </SurfaceText>
              </View>
            );
          })}
        </View>
      ) : (
        <SurfaceText font="text-sm" style={{ color: tokens.inverseMuted }}>
          {t('routines.active_program.empty.body')}
        </SurfaceText>
      )}

      {next && nextIndex >= 0 ? (
        <Pressable
          testID="active-program-start"
          onPress={props.onStart}
          accessibilityRole="button"
          style={({ pressed }) => ({
            minHeight: 48,
            borderRadius: 14,
            backgroundColor: tokens.accent,
            opacity: pressed ? 0.85 : 1,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: spacing[2],
          })}
        >
          <MsIconSrc name="playArrow" size={18} color={tokens.onAccent} />
          <SurfaceText font="text-base" weight="600" style={{ color: tokens.onAccent }}>
            {t('routines.active_program.start.button', { name: next.blueprint.name })}
          </SurfaceText>
        </Pressable>
      ) : !program.sessions.length ? (
        <Pressable
          onPress={props.onAddRoutine}
          accessibilityRole="button"
          style={({ pressed }) => ({
            minHeight: 48,
            borderRadius: 14,
            backgroundColor: tokens.accent,
            opacity: pressed ? 0.85 : 1,
            alignItems: 'center',
            justifyContent: 'center',
          })}
        >
          <SurfaceText font="text-base" weight="600" style={{ color: tokens.onAccent }}>
            {t('routines.active_program.add_routine.button')}
          </SurfaceText>
        </Pressable>
      ) : null}
    </View>
  );
}

function RoutineRow(props: {
  routine: SessionBlueprint;
  index: number;
  lastDone: LocalDate | undefined;
  onEdit: () => void;
  onStart: () => void;
}) {
  const { t } = useTranslate();
  const { tokens } = useAppTheme();
  const formatDate = useFormatDate();
  const { routine } = props;
  const count = routine.exercises.length;
  const exercises = routine.exercises.map((e) => e.name).join(' · ');
  const meta = [
    t(count === 1 ? 'routines.routine.exercises_one.label' : 'routines.routine.exercises_many.label', { count }),
    ...(count ? [t('routines.routine.minutes.label', { minutes: estimatedMinutesOf(routine) })] : []),
    lastDoneText(t, formatDate, props.lastDone),
  ].join(' · ');
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing[2],
        borderRadius: 16,
        borderWidth: 1,
        borderColor: tokens.line,
        backgroundColor: tokens.card,
        paddingRight: spacing[3],
      }}
    >
      <Pressable
        testID="routine-row"
        onPress={props.onEdit}
        accessibilityRole="button"
        accessibilityLabel={[routine.name, exercises, meta].filter(Boolean).join('. ')}
        accessibilityHint={t('routines.routine.edit.hint')}
        style={({ pressed }) => ({
          flex: 1,
          gap: spacing[1],
          paddingVertical: spacing[3],
          paddingLeft: spacing[4],
          borderTopLeftRadius: 16,
          borderBottomLeftRadius: 16,
          backgroundColor: pressed ? tokens.track : undefined,
        })}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
          <RoutineColorDot color={routine.color} index={props.index} />
          <SurfaceText font="text-base" weight="600" style={{ flexShrink: 1, color: tokens.ink }}>
            {routine.name}
          </SurfaceText>
        </View>
        <SurfaceText font="text-sm" numberOfLines={1} style={{ color: tokens.ink }}>
          {exercises || t('routines.routine.no_exercises.label')}
        </SurfaceText>
        <SurfaceText font="text-xs" style={{ color: tokens.muted }}>
          {meta}
        </SurfaceText>
      </Pressable>
      <Pressable
        testID="routine-start"
        onPress={props.onStart}
        disabled={!count}
        accessibilityRole="button"
        accessibilityLabel={t('routines.routine.start.label', { name: routine.name })}
        accessibilityState={{ disabled: !count }}
        style={({ pressed }) => ({
          width: MIN_TOUCH_TARGET,
          height: MIN_TOUCH_TARGET,
          borderRadius: MIN_TOUCH_TARGET / 2,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: !count ? tokens.track : pressed ? tokens.accentLine : tokens.accentSoft,
        })}
      >
        <MsIconSrc name="playArrow" size={20} color={count ? tokens.accentSoftInk : tokens.faint} />
      </Pressable>
    </View>
  );
}

function Section(props: { title: string; action?: { label: string; onPress: () => void }; children: ReactNode }) {
  const { tokens } = useAppTheme();
  return (
    <View style={{ gap: spacing[2] }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: spacing[1],
        }}
      >
        <SurfaceText font="text-lg" weight="700" accessibilityRole="header" style={{ color: tokens.ink }}>
          {props.title}
        </SurfaceText>
        {props.action ? (
          <Pressable
            onPress={props.action.onPress}
            accessibilityRole="button"
            style={{ minHeight: MIN_TOUCH_TARGET, justifyContent: 'center', paddingLeft: spacing[2] }}
          >
            <SurfaceText font="text-sm" weight="600" style={{ color: tokens.accentInk }}>
              {props.action.label}
            </SurfaceText>
          </Pressable>
        ) : null}
      </View>
      {props.children}
    </View>
  );
}

function DashedButton(props: { icon: AppIconName; label: string; onPress: () => void; testID?: string }) {
  const { tokens } = useAppTheme();
  return (
    <Pressable
      testID={props.testID}
      onPress={props.onPress}
      accessibilityRole="button"
      style={({ pressed }) => ({
        minHeight: 50,
        borderRadius: 14,
        borderWidth: 1.5,
        borderStyle: 'dashed',
        borderColor: tokens.line3,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing[2],
        backgroundColor: pressed ? tokens.track : undefined,
      })}
    >
      <MsIconSrc name={props.icon} size={18} color={tokens.ink} />
      <SurfaceText font="text-base" weight="600" style={{ color: tokens.ink }}>
        {props.label}
      </SurfaceText>
    </Pressable>
  );
}

function OutlinedButton(props: { icon: AppIconName; label: string; onPress: () => void; testID?: string }) {
  const { tokens } = useAppTheme();
  return (
    <Pressable
      testID={props.testID}
      onPress={props.onPress}
      accessibilityRole="button"
      style={({ pressed }) => ({
        flex: 1,
        minHeight: 48,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: tokens.line,
        backgroundColor: pressed ? tokens.track : tokens.card,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing[1],
        paddingHorizontal: spacing[2],
      })}
    >
      <MsIconSrc name={props.icon} size={18} color={tokens.ink} />
      <SurfaceText font="text-sm" weight="600" numberOfLines={1} style={{ color: tokens.ink }}>
        {props.label}
      </SurfaceText>
    </Pressable>
  );
}

function LibraryTile(props: {
  title: string;
  subtitle: string;
  onPress: () => void;
  accent?: boolean;
  icon?: AppIconName;
}) {
  const { tokens } = useAppTheme();
  const ink = props.accent ? tokens.accentSoftInk : tokens.ink;
  return (
    <Pressable
      onPress={props.onPress}
      accessibilityRole="button"
      accessibilityLabel={`${props.title}. ${props.subtitle}`}
      style={({ pressed }) => ({
        flexBasis: '45%',
        flexGrow: 1,
        minHeight: 64,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: props.accent ? tokens.accentLine : tokens.line,
        backgroundColor: pressed ? tokens.track : props.accent ? tokens.accentSoft : tokens.card,
        padding: spacing[3],
        gap: spacing[0.5],
      })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[1] }}>
        {props.icon ? <MsIconSrc name={props.icon} size={16} color={ink} /> : null}
        <SurfaceText font="text-base" weight="600" numberOfLines={1} style={{ flexShrink: 1, color: ink }}>
          {props.title}
        </SurfaceText>
      </View>
      <SurfaceText font="text-xs" style={{ color: props.accent ? tokens.accentSoftInk : tokens.muted }}>
        {props.subtitle}
      </SurfaceText>
    </Pressable>
  );
}

function lastDoneText(
  t: TranslateFn,
  formatDate: ReturnType<typeof useFormatDate>,
  date: LocalDate | undefined,
): string {
  if (!date) {
    return t('routines.last_done.never.label');
  }
  const ago = daysAgoOf(date, LocalDate.now());
  switch (ago.unit) {
    case 'today':
      return t('routines.last_done.today.label');
    case 'yesterday':
      return t('routines.last_done.yesterday.label');
    case 'days':
      return t('routines.last_done.days.label', { count: ago.count });
    case 'weeks':
      return t('routines.last_done.weeks.label', { count: ago.count });
    case 'date':
      return formatDate(date, { month: 'short', day: 'numeric' });
  }
}
