import { ActionButton } from '@/components/presentation/foundation/action-button';
import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { MIN_TOUCH_TARGET } from '@/components/presentation/foundation/touch-target';
import { ExerciseCreateForm } from '@/components/presentation/workout-editor/exercise-create-form';
import {
  customExerciseOf,
  EQUIPMENT_CHOICES,
  type EquipmentChoice,
  MUSCLE_GROUPS,
  type MuscleGroup,
  musclesForGroup,
  pickerListOf,
  type PickerRow,
  type PickerSection,
  recentExerciseIds,
  toggledPick,
} from '@/components/presentation/workout-editor/exercise-picker';
import {
  type ChipOption,
  ExercisePickerChipRow,
  ExercisePickerSearchField,
} from '@/components/presentation/workout-editor/exercise-picker-filters';
import {
  ExercisePickerCreateRow,
  ExercisePickerNoMatch,
  ExercisePickerRow,
  ExercisePickerSectionHeader,
} from '@/components/presentation/workout-editor/exercise-picker-row';
import { searchSeedFor } from '@/components/presentation/workout-editor/filter-exercises';
import { spacing, useAppTheme } from '@/hooks/useAppTheme';
import type { ExercisePickerMode } from '@/hooks/useExerciseSearch';
import { ExerciseDescriptor } from '@/models/exercise-models';
import { useAppSelector } from '@/store';
import { PickedExercise, setExerciseSearchResult } from '@/store/app';
import { selectExercises, selectLatestExercises, selectMuscles, updateExercise } from '@/store/stored-sessions';
import { translateExerciseMeta } from '@/utils/exercise-meta';
import { uuid } from '@/utils/uuid';
import { LegendList } from '@legendapp/list';
import { useTranslate } from '@tolgee/react';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { BackHandler, Platform, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDispatch } from 'react-redux';

type TranslateFn = ReturnType<typeof useTranslate>['t'];

interface ExerciseSearchProps {
  requestId: string;
  mode: ExercisePickerMode;
  /** The exercise being swapped out, if any. */
  exerciseName: string;
  /** The routine or workout the pick lands in, for "already in Push". */
  context: { name: string; exerciseIds: string[] } | undefined;
}

interface CreateDraft {
  name: string;
  muscles: string[];
  equipment: string | undefined;
}

/**
 * The exercise picker: search, muscle and equipment chips, Recent, then every exercise. Adding, taps pick
 * exercises in order and the bottom buttons add them, one after another or as a superset. Swapping, one tap
 * picks. New (or Create "X" when nothing matches) makes a custom exercise and picks it.
 */
export function ExerciseSearch({ requestId, mode, exerciseName, context }: ExerciseSearchProps) {
  const { t } = useTranslate();
  const { tokens } = useAppTheme();
  const dispatch = useDispatch();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // On iOS the modal route is a page sheet that starts below the status bar, yet the hook still reports the
  // window's inset. native-stack drops it for iOS modals the same way.
  const topInset = Platform.OS === 'ios' ? 0 : insets.top;
  const exercises = useAppSelector(selectExercises);
  const latestExercises = useAppSelector(selectLatestExercises);
  const catalogMuscles = useAppSelector(selectMuscles);
  const multiSelect = mode === 'add';

  // Swapping opens on the exercise's own name when it names one, so the list starts on it.
  const [query, setQuery] = useState(() => searchSeedFor(exercises, exerciseName));
  const [muscle, setMuscle] = useState<MuscleGroup | undefined>(undefined);
  const [equipment, setEquipment] = useState<EquipmentChoice | undefined>(undefined);
  const [picked, setPicked] = useState<string[]>([]);
  const [creating, setCreating] = useState<CreateDraft | undefined>(undefined);

  // Android's back button leaves the form for the list rather than closing the picker.
  useEffect(() => {
    if (!creating) {
      return;
    }
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setCreating(undefined);
      return true;
    });
    return () => subscription.remove();
  }, [creating]);

  const recentIds = recentExerciseIds(Object.values(latestExercises), exercises);
  const list = pickerListOf(exercises, recentIds, { query, muscle, equipment });
  const alreadyIn = new Set(context?.exerciseIds ?? []);

  const finish = (chosen: PickedExercise[], asSuperset: boolean) => {
    dispatch(setExerciseSearchResult({ requestId, exercises: chosen, asSuperset }));
    router.back();
  };
  const pickedExercises = (ids: string[]): PickedExercise[] =>
    ids.flatMap((id) => (exercises[id] ? [{ id, descriptor: exercises[id] }] : []));

  const onRowPress = (id: string) => {
    if (multiSelect) {
      setPicked((now) => toggledPick(now, id));
    } else {
      finish(pickedExercises([id]), false);
    }
  };

  const startCreate = (name: string) => setCreating({ name, muscles: musclesForGroup(muscle), equipment });
  const clearFilters = () => {
    setMuscle(undefined);
    setEquipment(undefined);
  };

  const saveCreated = () => {
    if (!creating?.name.trim()) {
      return;
    }
    const id = uuid();
    const descriptor: ExerciseDescriptor = customExerciseOf(creating);
    dispatch(updateExercise({ id, exercise: descriptor }));
    if (!multiSelect) {
      finish([{ id, descriptor }], false);
      return;
    }
    setPicked((now) => [...now, id]);
    setCreating(undefined);
    setQuery('');
  };

  const metaOf = (id: string, exercise: ExerciseDescriptor) =>
    [
      exercise.muscles[0] ? capitalise(translateExerciseMeta(t, 'muscle', exercise.muscles[0])) : undefined,
      exercise.equipment ? capitalise(translateExerciseMeta(t, 'equipment', exercise.equipment)) : undefined,
      alreadyIn.has(id)
        ? context?.name
          ? t('exercise_picker.row.already_in.label', { name: context.name })
          : t('exercise_picker.row.already_in_unnamed.label')
        : undefined,
    ]
      .filter((part) => !!part)
      .join(' · ');

  const renderRow = (row: PickerRow) => {
    switch (row.kind) {
      case 'header':
        return <ExercisePickerSectionHeader label={sectionLabel(t, row.section)} />;
      case 'create':
        return (
          <ExercisePickerCreateRow
            label={t('exercise_picker.create.button', { name: row.name })}
            onPress={() => startCreate(row.name)}
          />
        );
      case 'filtered':
        return (
          <ExercisePickerCreateRow
            testID="exercise-picker-filtered-row"
            icon="visibility"
            label={t('exercise_picker.filtered.button', { name: row.name })}
            onPress={clearFilters}
          />
        );
      case 'exercise': {
        const exercise = exercises[row.id];
        if (!exercise) {
          return null;
        }
        const at = picked.indexOf(row.id);
        return (
          <ExercisePickerRow
            testID={`exercise-picker-row-${row.id}`}
            name={exercise.name || t('exercise.name.untitled')}
            meta={metaOf(row.id, exercise)}
            multiSelect={multiSelect}
            order={at >= 0 ? at + 1 : undefined}
            orderLabel={at >= 0 ? t('exercise_picker.row.order.label', { order: at + 1 }) : undefined}
            onPress={() => onRowPress(row.id)}
          />
        );
      }
    }
  };

  const muscleOptions: ChipOption<MuscleGroup | undefined>[] = [
    { value: undefined, label: t('exercise_picker.muscle.all') },
    ...MUSCLE_GROUPS.map((group) => ({ value: group, label: muscleGroupLabel(t, group) })),
  ];
  const equipmentOptions: ChipOption<EquipmentChoice>[] = EQUIPMENT_CHOICES.map((choice) => ({
    value: choice,
    label: equipmentLabel(t, choice),
  }));

  const count = picked.length;
  const canSave = !!creating?.name.trim();

  const header = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        minHeight: MIN_TOUCH_TARGET,
      }}
    >
      <HeaderTextButton
        testID={creating ? 'exercise-create-back' : 'exercise-picker-cancel'}
        label={creating ? t('exercise_picker.create.back.button') : t('generic.cancel.button')}
        color={tokens.muted}
        onPress={() => (creating ? setCreating(undefined) : router.back())}
      />
      <SurfaceText font="text-base" weight="700" accessibilityRole="header" style={{ color: tokens.ink }}>
        {creating
          ? t('exercise_picker.create.title')
          : multiSelect
            ? t('exercise_picker.add.title')
            : t('exercise_picker.swap.title')}
      </SurfaceText>
      {creating ? (
        <HeaderTextButton
          testID="exercise-create-save"
          label={t('exercise_picker.create.save.button')}
          color={canSave ? tokens.accentInk : tokens.faint}
          disabled={!canSave}
          accessibilityHint={canSave ? undefined : t('exercise_picker.create.save.disabled.hint')}
          onPress={saveCreated}
        />
      ) : (
        <HeaderTextButton
          testID="exercise-picker-new"
          label={t('exercise_picker.new.button')}
          color={tokens.accentInk}
          onPress={() => startCreate(query.trim())}
        />
      )}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: tokens.bg, paddingLeft: insets.left, paddingRight: insets.right }}>
      <View
        style={{
          paddingTop: topInset + spacing[2],
          paddingHorizontal: spacing.pageHorizontalMargin,
          paddingBottom: creating ? spacing[2] : 10,
          gap: spacing[2],
          borderBottomWidth: 1,
          borderBottomColor: tokens.line,
          backgroundColor: tokens.bg,
        }}
      >
        {header}
        {creating ? null : (
          <>
            <ExercisePickerSearchField
              value={query}
              onChange={setQuery}
              placeholder={t('exercise_picker.search.placeholder', { count: Object.keys(exercises).length })}
              accessibilityLabel={t('exercise_picker.search.label')}
              clearLabel={t('exercise_picker.search.clear.button')}
            />
            <View>
              <ExercisePickerChipRow
                testID="exercise-picker-muscle"
                accessibilityLabel={t('exercise_picker.muscle.label')}
                options={muscleOptions}
                selected={muscle}
                onSelect={setMuscle}
              />
              <ExercisePickerChipRow
                testID="exercise-picker-equipment"
                accessibilityLabel={t('exercise_picker.equipment.label')}
                options={[{ value: undefined, label: t('exercise_picker.equipment.any') }, ...equipmentOptions]}
                selected={equipment}
                onSelect={setEquipment}
              />
            </View>
          </>
        )}
      </View>

      {creating ? (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: spacing.pageHorizontalMargin, paddingBottom: insets.bottom + spacing[6] }}
        >
          <ExerciseCreateForm
            name={creating.name}
            onNameChange={(name) => setCreating((now) => now && { ...now, name })}
            nameLabel={t('exercise.name.label')}
            namePlaceholder={t('exercise.name.placeholder')}
            musclesLabel={t('exercise_picker.create.muscles.label')}
            musclesHint={t('exercise_picker.create.muscles.hint')}
            muscleOptions={catalogMuscles.map((value) => ({
              value,
              label: capitalise(translateExerciseMeta(t, 'muscle', value)),
            }))}
            muscles={creating.muscles}
            onMusclesChange={(muscles) => setCreating((now) => now && { ...now, muscles })}
            equipment={{
              label: t('exercise_picker.equipment.label'),
              noneLabel: t('exercise_picker.create.equipment.none'),
              options: equipmentOptions,
              value: creating.equipment,
              onChange: (value) => setCreating((now) => now && { ...now, equipment: value }),
            }}
          />
        </ScrollView>
      ) : list.noMatch ? (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: spacing.pageHorizontalMargin }}
        >
          <ExercisePickerNoMatch
            title={
              list.hiddenByFilters
                ? t('exercise_picker.no_match.filtered.title', { name: query.trim() })
                : t('exercise_picker.no_match.title', { name: query.trim() })
            }
            body={
              list.hiddenByFilters ? t('exercise_picker.no_match.filtered.body') : t('exercise_picker.no_match.body')
            }
            actions={[
              ...(list.hiddenByFilters
                ? [
                    {
                      testID: 'exercise-picker-clear-filters',
                      label: t('exercise_picker.filters.clear.button'),
                      onPress: clearFilters,
                    },
                  ]
                : []),
              ...(list.canCreate
                ? [
                    {
                      testID: 'exercise-picker-create',
                      label: t('exercise_picker.create.button', { name: query.trim() }),
                      onPress: () => startCreate(query.trim()),
                    },
                  ]
                : []),
            ]}
          />
        </ScrollView>
      ) : (
        <LegendList
          // A new search or chip is a new list: remounting starts it at the top. Kept, the old scroll offset
          // lands past the end of a shorter list and shows it blank or partway down.
          key={`${query.trim()}|${muscle ?? ''}|${equipment ?? ''}`}
          data={list.rows}
          extraData={picked}
          estimatedItemSize={66}
          keyExtractor={(row) => row.key}
          getItemType={(row) => row.kind}
          renderItem={({ item }) => <View style={{ paddingBottom: 6 }}>{renderRow(item)}</View>}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={{
            paddingHorizontal: spacing.pageHorizontalMargin,
            paddingTop: spacing[3],
            paddingBottom: multiSelect ? spacing[6] : insets.bottom + spacing[6],
          }}
          style={{ flex: 1 }}
        />
      )}

      {multiSelect && !creating ? (
        <View
          style={{
            flexDirection: 'row',
            gap: 10,
            paddingHorizontal: spacing.pageHorizontalMargin,
            paddingTop: spacing[3],
            paddingBottom: insets.bottom + spacing[3],
            borderTopWidth: 1,
            borderTopColor: tokens.line,
            backgroundColor: tokens.bg,
          }}
        >
          {count >= 2 ? (
            <ActionButton
              testID="exercise-picker-superset"
              variant="secondary"
              label={t('exercise_picker.superset.button')}
              onPress={() => finish(pickedExercises(picked), true)}
            />
          ) : null}
          <ActionButton
            testID="exercise-picker-add"
            style={{ flex: 1 }}
            disabled={count === 0}
            label={
              count === 0
                ? t('exercise_picker.pick.button')
                : count === 1
                  ? t('exercise_picker.add_one.button')
                  : t('exercise_picker.add_many.button', { count })
            }
            onPress={() => finish(pickedExercises(picked), false)}
          />
        </View>
      ) : null}
    </View>
  );
}

interface HeaderTextButtonProps {
  label: string;
  color: string;
  onPress: () => void;
  disabled?: boolean;
  accessibilityHint?: string;
  testID?: string;
}

function HeaderTextButton({ label, color, onPress, disabled, accessibilityHint, testID }: HeaderTextButtonProps) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      accessibilityHint={accessibilityHint}
      style={({ pressed }) => ({
        minHeight: MIN_TOUCH_TARGET,
        minWidth: MIN_TOUCH_TARGET,
        justifyContent: 'center',
        paddingHorizontal: spacing[1],
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <SurfaceText font="text-base" weight="600" style={{ color }}>
        {label}
      </SurfaceText>
    </Pressable>
  );
}

function sectionLabel(t: TranslateFn, section: PickerSection): string {
  switch (section) {
    case 'recent':
      return t('exercise_picker.section.recent');
    case 'all':
      return t('exercise_picker.section.all');
    case 'matches':
      return t('exercise_picker.section.matches');
    default:
      return muscleGroupLabel(t, section);
  }
}

function muscleGroupLabel(t: TranslateFn, group: MuscleGroup): string {
  switch (group) {
    case 'chest':
      return t('exercise_picker.muscle.chest');
    case 'back':
      return t('exercise_picker.muscle.back');
    case 'shoulders':
      return t('exercise_picker.muscle.shoulders');
    case 'arms':
      return t('exercise_picker.muscle.arms');
    case 'legs':
      return t('exercise_picker.muscle.legs');
    case 'core':
      return t('exercise_picker.muscle.core');
  }
}

/** From the same keys as a row's equipment meta, so a chip and the rows it filters use one word. */
export function equipmentLabel(t: TranslateFn, choice: EquipmentChoice): string {
  return capitalise(translateExerciseMeta(t, 'equipment', choice));
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
