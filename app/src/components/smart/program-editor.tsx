import Menu from '@/components/presentation/foundation/menu';
import { MsIconSrc } from '@/components/presentation/foundation/ms-icon-source';
import { RoundIconButton } from '@/components/presentation/foundation/round-icon-button';
import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { useToast } from '@/components/presentation/foundation/toast';
import { MIN_TOUCH_TARGET } from '@/components/presentation/foundation/touch-target';
import { RoutineColorDot } from '@/components/presentation/workout-editor/routine-color-swatches';
import { estimatedMinutesOf } from '@/components/presentation/workout-editor/routine-summary';
import CopyWorkoutDialog from '@/components/smart/copy-workout-dialog';
import { ItemMenu, programSummary, useSwitchActiveProgram } from '@/components/smart/program-list-item';
import { routineEditorHref } from '@/components/smart/routines-screen';
import { fontFamily, spacing, useAppTheme } from '@/hooks/useAppTheme';
import { useBackWhenGone } from '@/hooks/useBackWhenGone';
import { SessionBlueprint } from '@/models/blueprint-models';
import { useAppSelector } from '@/store';
import {
  addProgramSession,
  moveSessionBlueprintDownInProgram,
  moveSessionBlueprintUpInProgram,
  setProgramSessions,
  setSavedPlanName,
} from '@/store/program';
import { useTranslate } from '@tolgee/react';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { useDispatch } from 'react-redux';

/**
 * One program: its name, whether it is the one in use, and its routines in order. Routines open in the
 * routine editor; adding one starts a new routine there. Nothing floats over the list.
 */
export function ProgramEditor({ programId }: { programId: string }) {
  const { t } = useTranslate();
  const { tokens } = useAppTheme();
  const router = useRouter();
  const dispatch = useDispatch();
  const program = useAppSelector((x) => x.program.savedPrograms[programId]);
  const isActive = useAppSelector((x) => x.program.activePlanId) === programId;
  const switchTo = useSwitchActiveProgram();
  useBackWhenGone(!program);

  if (!program) {
    return null;
  }

  return (
    <ScrollView
      style={{ backgroundColor: tokens.bg }}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ padding: spacing.pageHorizontalMargin, paddingBottom: spacing[10], gap: spacing[4] }}
    >
      <Stack.Screen options={{ title: program.name }} />
      <View
        style={{
          backgroundColor: tokens.card,
          borderRadius: 18,
          borderWidth: 1,
          borderColor: tokens.line,
          padding: spacing[4],
          gap: spacing[2],
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <SurfaceText
            font="text-xs"
            weight="600"
            style={{ flex: 1, color: tokens.muted, textTransform: 'uppercase', letterSpacing: 0.7 }}
          >
            {t('routines.program_editor.name.label')}
          </SurfaceText>
          <ItemMenu id={programId} showEdit={false} />
        </View>
        <TextInput
          testID="program-name"
          value={program.name}
          onChangeText={(name) => dispatch(setSavedPlanName({ programId, name }))}
          accessibilityLabel={t('routines.program_editor.name.label')}
          placeholder={t('plan.new_default_name.label')}
          placeholderTextColor={tokens.placeholder}
          style={{
            fontFamily: fontFamily.text,
            fontSize: 24,
            fontWeight: '700',
            color: tokens.ink,
            padding: 0,
            minHeight: MIN_TOUCH_TARGET,
          }}
        />
        <SurfaceText font="text-sm" style={{ color: tokens.muted }}>
          {programSummary(t, program)}
        </SurfaceText>
        {isActive ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[1] }}>
            <MsIconSrc name="check" size={16} color={tokens.accentInk} />
            <SurfaceText font="text-sm" weight="600" style={{ color: tokens.accentInk }}>
              {t('routines.program_editor.active.label')}
            </SurfaceText>
          </View>
        ) : (
          <Pressable
            testID="program-use"
            onPress={() => switchTo(programId)}
            accessibilityRole="button"
            style={({ pressed }) => ({
              minHeight: MIN_TOUCH_TARGET,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: tokens.line,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: pressed ? tokens.track : tokens.card,
            })}
          >
            <SurfaceText font="text-sm" weight="600" style={{ color: tokens.ink }}>
              {t('routines.use_program.button')}
            </SurfaceText>
          </Pressable>
        )}
      </View>

      <SurfaceText
        font="text-lg"
        weight="700"
        accessibilityRole="header"
        style={{ color: tokens.ink, paddingHorizontal: spacing[1] }}
      >
        {t('routines.program_editor.routines.title')}
      </SurfaceText>
      {program.sessions.length === 0 ? (
        <SurfaceText font="text-sm" style={{ color: tokens.muted, paddingHorizontal: spacing[1] }}>
          {t('routines.program_editor.empty.body')}
        </SurfaceText>
      ) : null}
      {program.sessions.map((routine, index) => (
        <ProgramRoutineCard
          key={`${index}-${routine.name}`}
          programId={programId}
          routine={routine}
          index={index}
          count={program.sessions.length}
          onOpen={() => router.push(routineEditorHref(programId, index))}
        />
      ))}
      <Pressable
        testID="program-add-routine"
        onPress={() => router.push(routineEditorHref(programId, program.sessions.length, { isNew: true }))}
        accessibilityRole="button"
        style={({ pressed }) => ({
          minHeight: 54,
          borderRadius: 16,
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
        <MsIconSrc name="add" size={20} color={tokens.ink} />
        <SurfaceText font="text-base" weight="600" style={{ color: tokens.ink }}>
          {t('routines.new_routine.button')}
        </SurfaceText>
      </Pressable>
    </ScrollView>
  );
}

function ProgramRoutineCard(props: {
  programId: string;
  routine: SessionBlueprint;
  index: number;
  count: number;
  onOpen: () => void;
}) {
  const { t } = useTranslate();
  const { tokens } = useAppTheme();
  const dispatch = useDispatch();
  const toast = useToast();
  const sessions = useAppSelector((x) => x.program.savedPrograms[props.programId]?.sessions ?? []);
  const [copyOpen, setCopyOpen] = useState(false);
  const { routine, programId } = props;
  const exercises = routine.exercises.length;
  const meta = [
    t(exercises === 1 ? 'routines.routine.exercises_one.label' : 'routines.routine.exercises_many.label', {
      count: exercises,
    }),
    ...(exercises ? [t('routines.routine.minutes.label', { minutes: estimatedMinutesOf(routine) })] : []),
  ].join(' · ');

  const restore = (before: SessionBlueprint[]) =>
    dispatch(setProgramSessions({ programId, sessionBlueprints: before }));

  const remove = () => {
    const before = sessions;
    dispatch(setProgramSessions({ programId, sessionBlueprints: before.filter((_, i) => i !== props.index) }));
    toast.show({
      message: t('workout.removed.message'),
      action: { label: t('generic.undo.button'), onPress: () => restore(before) },
    });
  };

  const duplicate = () => {
    const before = sessions;
    dispatch(
      addProgramSession({
        programId,
        sessionBlueprint: routine.with({ name: t('routines.program_editor.copy_name.label', { name: routine.name }) }),
      }),
    );
    toast.show({
      message: t('workout.duplicated.message'),
      action: { label: t('generic.undo.button'), onPress: () => restore(before) },
    });
  };

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: tokens.line,
        backgroundColor: tokens.card,
        paddingRight: spacing[1],
      }}
    >
      <Pressable
        testID="program-routine"
        onPress={props.onOpen}
        accessibilityRole="button"
        accessibilityLabel={`${routine.name}. ${meta}`}
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
          {routine.exercises.map((e) => e.name).join(' · ') || t('routines.routine.no_exercises.label')}
        </SurfaceText>
        <SurfaceText font="text-xs" style={{ color: tokens.muted }}>
          {meta}
        </SurfaceText>
      </Pressable>
      <RoundIconButton
        icon="arrowUpward"
        size="compact"
        disabled={props.index === 0}
        accessibilityLabel={t('routines.program_editor.move_up.label', { name: routine.name })}
        onPress={() => dispatch(moveSessionBlueprintUpInProgram({ programId, sessionBlueprint: routine }))}
      />
      <RoundIconButton
        icon="arrowDownward"
        size="compact"
        disabled={props.index === props.count - 1}
        accessibilityLabel={t('routines.program_editor.move_down.label', { name: routine.name })}
        onPress={() => dispatch(moveSessionBlueprintDownInProgram({ programId, sessionBlueprint: routine }))}
      />
      <Menu
        size={44}
        trigger={(open) => (
          <RoundIconButton
            icon="moreHoriz"
            size="compact"
            accessibilityLabel={t('routines.program_editor.more.label', { name: routine.name })}
            onPress={open}
          />
        )}
        items={[
          {
            label: t('generic.duplicate.button'),
            icon: 'contentCopy',
            systemImage: 'doc.on.doc',
            onPress: duplicate,
          },
          {
            label: t('workout.copy_to_plan.button'),
            icon: 'copyAll',
            systemImage: 'doc.on.clipboard',
            onPress: () => setCopyOpen(true),
          },
          {
            label: t('generic.remove.button'),
            icon: 'delete',
            systemImage: 'trash',
            destructive: true,
            onPress: remove,
          },
        ]}
      />
      <CopyWorkoutDialog
        visible={copyOpen}
        onDismiss={() => setCopyOpen(false)}
        sessionBlueprint={routine}
        currentProgramId={programId}
      />
    </View>
  );
}
