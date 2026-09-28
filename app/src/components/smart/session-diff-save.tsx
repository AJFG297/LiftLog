import { ActionButton } from '@/components/presentation/foundation/action-button';
import Menu from '@/components/presentation/foundation/menu';
import { MsIconSrc } from '@/components/presentation/foundation/ms-icon-source';
import { RoundIconButton } from '@/components/presentation/foundation/round-icon-button';
import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { useToast } from '@/components/presentation/foundation/toast';
import { RoutineChangeRow } from '@/components/presentation/summary/routine-change-row';
import { routineChangeCopy } from '@/components/presentation/summary/routine-change-copy';
import { spacing, useAppTheme } from '@/hooks/useAppTheme';
import { useOnDismiss } from '@/hooks/useOnDismiss';
import { diffSessionBlueprints, PlanDiff, SessionBlueprintDiff } from '@/models/blueprint-diff';
import { ProgramBlueprint } from '@/models/blueprint-models';
import { routineChanges, routineUpdateDiff } from '@/models/routine-update';
import { EmptySession } from '@/models/session-models';
import { useAppSelector, useAppSelectorWithArg } from '@/store';
import {
  applyDiffToPlan,
  fetchUpcomingSessions,
  savePlan,
  selectNewWorkoutName,
  selectPendingPlanDiff,
  selectProgram,
  setPendingPlanDiff,
} from '@/store/program';
import { useTranslate } from '@tolgee/react';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDispatch } from 'react-redux';

/** Today's whole workout as a new routine, diffed against nothing so every exercise is an addition. */
function saveAsNewRoutineDiff(planDiff: PlanDiff, name: string): SessionBlueprintDiff {
  return diffSessionBlueprints(EmptySession.blueprint, planDiff.diff.newSession.with({ name }));
}

/**
 * The "Update your routine?" sheet: the structural changes made during a finished workout, each kept for
 * next time while it is ticked. Opened over the summary (or Home) with the diff in `pendingPlanDiff`.
 */
export function SessionDiffSaveEditor() {
  const dispatch = useDispatch();
  const { t } = useTranslate();
  const { tokens } = useAppTheme();
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const planDiff = useAppSelector(selectPendingPlanDiff);
  const programId = planDiff?.programId ?? '';
  const program: ProgramBlueprint | undefined = useAppSelectorWithArg(selectProgram, programId);
  const newRoutineName = useAppSelectorWithArg(selectNewWorkoutName, programId);
  // Rows start ticked: each one is something the lifter chose to do today.
  const [unticked, setUnticked] = useState<ReadonlySet<string>>(new Set());

  // Clear the diff on any exit so the next finished workout can open the sheet again.
  useOnDismiss(() => dispatch(setPendingPlanDiff(undefined)));

  if (!planDiff) {
    return <View style={{ flex: 1, backgroundColor: tokens.card }} />;
  }

  const updating = planDiff.type === 'diff';
  const routineName = updating ? planDiff.diff.originalSession.name : planDiff.diff.newSession.name;
  const rows = routineChanges(planDiff.diff);
  const kept = rows.filter((row) => !unticked.has(row.id));

  const toggle = (id: string) =>
    setUnticked((current) => {
      const next = new Set(current);
      if (!next.delete(id)) {
        next.add(id);
      }
      return next;
    });

  const applyAndClose = (diff: PlanDiff, message: string) => {
    const before = program;
    dispatch(applyDiffToPlan(diff));
    dispatch(fetchUpcomingSessions());
    // A native sheet covers the toast, so it closes first.
    router.back();
    toast.show({
      message,
      action: before
        ? {
            label: t('generic.undo.button'),
            onPress: () => {
              dispatch(savePlan({ programId, programBlueprint: before }));
              dispatch(fetchUpcomingSessions());
            },
          }
        : undefined,
    });
  };

  const apply = () => {
    const diff = routineUpdateDiff(planDiff.diff, new Set(kept.map((row) => row.id)));
    if (!updating) {
      applyAndClose({ ...planDiff, diff }, t('finish.save_routine.saved.message', { name: routineName }));
      return;
    }
    applyAndClose(
      { ...planDiff, diff },
      kept.length === 1
        ? t('finish.update_routine.updated_one.message', { name: routineName })
        : t('finish.update_routine.updated_many.message', { name: routineName, count: kept.length }),
    );
  };

  const saveAsNewRoutine = () =>
    applyAndClose(
      { type: 'add', programId, diff: saveAsNewRoutineDiff(planDiff, newRoutineName) },
      t('finish.save_routine.saved.message', { name: newRoutineName }),
    );

  const applyLabel =
    kept.length === 0
      ? t('finish.update_routine.nothing_selected.button')
      : updating
        ? t('finish.update_routine.apply.button', { count: kept.length })
        : t('finish.save_routine.apply.button', { count: kept.length });

  return (
    <View style={{ flex: 1, backgroundColor: tokens.card }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: spacing.pageHorizontalMargin,
          paddingBottom: Math.max(insets.bottom, spacing[4]),
          gap: spacing[4],
        }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingTop: spacing[3] }}>
          <RoundIconButton icon="close" accessibilityLabel={t('generic.close.button')} onPress={() => router.back()} />
          {updating ? (
            <Menu
              size={44}
              trigger={(open) => (
                <RoundIconButton
                  icon="moreHoriz"
                  accessibilityLabel={t('finish.update_routine.more_options.label')}
                  onPress={open}
                />
              )}
              items={[
                {
                  label: t('finish.update_routine.save_as_new.button'),
                  icon: 'add',
                  systemImage: 'plus.rectangle.on.rectangle',
                  onPress: saveAsNewRoutine,
                },
              ]}
            />
          ) : null}
        </View>
        <View style={{ gap: spacing[1], paddingHorizontal: spacing[1] }}>
          <SurfaceText font="text-2xl" weight="700" accessibilityRole="header" style={{ color: tokens.ink }}>
            {updating
              ? t('finish.update_routine.title', { name: routineName })
              : t('finish.save_routine.title', { name: routineName })}
          </SurfaceText>
          <SurfaceText font="text-sm" style={{ color: tokens.muted }}>
            {updating ? t('finish.update_routine.body') : t('finish.save_routine.body')}
          </SurfaceText>
        </View>
        <View style={{ gap: spacing[2] }}>
          {rows.map((row) => (
            <RoutineChangeRow
              key={row.id}
              {...routineChangeCopy(t, row)}
              selected={!unticked.has(row.id)}
              onToggle={() => toggle(row.id)}
            />
          ))}
        </View>
        <View style={{ flexDirection: 'row', gap: spacing[2], paddingHorizontal: spacing[1] }}>
          <MsIconSrc name="info" size={16} color={tokens.muted} />
          <SurfaceText font="text-sm" style={{ flex: 1, color: tokens.muted }}>
            {t('finish.update_routine.progression_note.body')}
          </SurfaceText>
        </View>
        <View style={{ gap: spacing[2] }}>
          <ActionButton label={applyLabel} disabled={kept.length === 0} onPress={apply} />
          <ActionButton
            variant="secondary"
            label={updating ? t('finish.update_routine.keep.button') : t('finish.save_routine.skip.button')}
            onPress={() => router.back()}
          />
        </View>
      </ScrollView>
    </View>
  );
}
