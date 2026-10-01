import Menu, { type MenuItem } from '@/components/presentation/foundation/menu';
import { RoundIconButton } from '@/components/presentation/foundation/round-icon-button';
import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { useToast } from '@/components/presentation/foundation/toast';
import { spacing, useAppTheme } from '@/hooks/useAppTheme';
import { ProgramBlueprint } from '@/models/blueprint-models';
import { SharedProgramBlueprint } from '@/models/feed-models';
import { useAppSelector } from '@/store';
import { encryptAndShare } from '@/store/feed';
import { deleteSavedPlan, exportPlan, savePlan, setActivePlan } from '@/store/program';
import { uuid } from '@/utils/uuid';
import { useTranslate } from '@tolgee/react';
import { useRouter } from 'expo-router';
import { Alert, Pressable, View } from 'react-native';
import { useDispatch } from 'react-redux';
import { programHref } from '@/components/smart/routines-href';

/** "3 days · 12 exercises": a program's size. */
export function programSummary(t: ReturnType<typeof useTranslate>['t'], program: ProgramBlueprint): string {
  const days = program.sessions.length;
  const exercises = program.sessions.reduce((total, session) => total + session.exercises.length, 0);
  return [
    t(days === 1 ? 'plan.summary.day' : 'plan.summary.days', { count: days }),
    t(exercises === 1 ? 'plan.summary.exercise' : 'plan.summary.exercises', { count: exercises }),
  ].join(' · ');
}

/**
 * Makes a program the active one, but only after asking: it changes what every next workout is, so it must
 * never be one stray tap. Afterwards a toast offers Undo.
 */
export function useSwitchActiveProgram() {
  const { t } = useTranslate();
  const dispatch = useDispatch();
  const toast = useToast();
  const activePlanId = useAppSelector((x) => x.program.activePlanId);
  const programs = useAppSelector((x) => x.program.savedPrograms);

  return (programId: string) => {
    const program = programs[programId];
    if (!program || programId === activePlanId) {
      return;
    }
    const previous = activePlanId;
    const current = programs[previous];
    Alert.alert(
      t('routines.use_program.confirm.title', { name: program.name }),
      current
        ? t('routines.use_program.confirm.body', { name: program.name, current: current.name })
        : t('routines.use_program.confirm_first.body', { name: program.name }),
      [
        { text: t('generic.cancel.button'), style: 'cancel' },
        {
          text: t('routines.use_program.confirm.button'),
          onPress: () => {
            dispatch(setActivePlan({ activePlanId: programId }));
            toast.show({
              message: t('plan.now_using.message', { name: program.name }),
              action: current
                ? {
                    label: t('generic.undo.button'),
                    onPress: () => dispatch(setActivePlan({ activePlanId: previous })),
                  }
                : undefined,
            });
          },
        },
      ],
    );
  };
}

/** A program's actions: edit, use, duplicate, share, export and remove. */
export function ItemMenu({ id, showEdit = true }: { id: string; showEdit?: boolean }) {
  const program = useAppSelector((x) => x.program.savedPrograms[id]);
  const isActive = useAppSelector((x) => x.program.activePlanId) === id;
  const dispatch = useDispatch();
  const { push } = useRouter();
  const { t } = useTranslate();
  const toast = useToast();
  const switchTo = useSwitchActiveProgram();
  if (!program) {
    return null;
  }
  const items: MenuItem[] = [
    ...(showEdit
      ? [
          {
            label: t('generic.edit.button'),
            icon: 'edit',
            systemImage: 'pencil',
            onPress: () => push(programHref(id)),
          } as const,
        ]
      : []),
    ...(!isActive
      ? [
          {
            label: t('routines.use_program.button'),
            icon: 'check',
            systemImage: 'checkmark.circle',
            onPress: () => switchTo(id),
          } as const,
        ]
      : []),
    {
      label: t('generic.duplicate.button'),
      icon: 'contentCopy',
      systemImage: 'doc.on.doc',
      onPress: () => dispatch(savePlan({ programId: uuid(), programBlueprint: program })),
    },
    {
      label: t('generic.share.button'),
      icon: 'share',
      systemImage: 'square.and.arrow.up',
      onPress: () =>
        dispatch(
          encryptAndShare({
            title: t('plan.shared_item.title'),
            item: new SharedProgramBlueprint(program),
          }),
        ),
    },
    {
      label: t('plan.export.button'),
      icon: 'upload',
      systemImage: 'arrow.up.doc',
      onPress: () => dispatch(exportPlan({ programId: id })),
    },
    {
      label: t('generic.remove.button'),
      icon: 'delete',
      systemImage: 'trash',
      destructive: true,
      disabled: isActive,
      onPress: () => {
        dispatch(deleteSavedPlan({ programId: id }));
        toast.show({
          message: t('plan.deleted.message'),
          action: {
            label: t('generic.undo.button'),
            onPress: () => dispatch(savePlan({ programId: id, programBlueprint: program })),
          },
        });
      },
    },
  ];
  return (
    <Menu
      testID="more-program-btn"
      size={44}
      trigger={(open) => (
        <RoundIconButton
          icon="moreHoriz"
          size="compact"
          accessibilityLabel={t('routines.program.more.label', { name: program.name })}
          onPress={open}
        />
      )}
      items={items}
    />
  );
}

interface ProgramListItemProps {
  id: string;
  /** Highlights a program just added, by an import or a share. */
  isFocused: boolean;
}

/** A saved program that isn't the active one. Tapping opens it; making it active is in its menu, and asks first. */
export function ProgramListItem({ id, isFocused }: ProgramListItemProps) {
  const program = useAppSelector((x) => x.program.savedPrograms[id]);
  const { push } = useRouter();
  const { t } = useTranslate();
  const { tokens } = useAppTheme();
  if (!program) {
    return null;
  }
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: isFocused ? tokens.accentLine : tokens.line,
        backgroundColor: isFocused ? tokens.wash : tokens.card,
        paddingRight: spacing[1],
      }}
    >
      <Pressable
        testID="program-list-item"
        onPress={() => push(programHref(id))}
        accessibilityRole="button"
        accessibilityLabel={`${program.name}. ${programSummary(t, program)}`}
        style={({ pressed }) => ({
          flex: 1,
          minHeight: 56,
          justifyContent: 'center',
          gap: spacing[0.5],
          paddingVertical: spacing[3],
          paddingLeft: spacing[4],
          borderTopLeftRadius: 16,
          borderBottomLeftRadius: 16,
          backgroundColor: pressed ? tokens.track : undefined,
        })}
      >
        <SurfaceText font="text-base" weight="600" style={{ color: tokens.ink }}>
          {program.name}
        </SurfaceText>
        <SurfaceText font="text-sm" style={{ color: tokens.muted }}>
          {programSummary(t, program)}
        </SurfaceText>
      </Pressable>
      <ItemMenu id={id} />
    </View>
  );
}
