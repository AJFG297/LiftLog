import { Chip } from '@/components/presentation/foundation/chip';
import { DismissArea } from '@/components/presentation/foundation/dismiss-area';
import { HeaderPillButton } from '@/components/presentation/foundation/header-pill-button';
import { haptics } from '@/components/presentation/foundation/haptics';
import { MsIconSrc } from '@/components/presentation/foundation/ms-icon-source';
import {
  NumberPad,
  type NumberPadAction,
  type NumberPadBuffer,
  type NumberPadField,
  numberPadReducer,
  numberPadValue,
  openNumberPad,
} from '@/components/presentation/foundation/number-pad';
import { SegmentedControl } from '@/components/presentation/foundation/segmented-control';
import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { MIN_TOUCH_TARGET } from '@/components/presentation/foundation/touch-target';
import {
  isEmptyBar,
  resolvedWarmupWeight,
  resolvedWeightNote,
  WARMUP_PRESETS,
  WarmupPresetId,
  warmupPresetSets,
  withWarmupAdded,
  withWarmupLoadTypeAt,
  withWarmupLoadValue,
  withWarmupPreset,
  withWarmupRemoved,
  withWarmupRepsAt,
  workingWeightNote,
} from '@/components/presentation/workout-editor/warmup-edit';
import { spacing, useAppTheme } from '@/hooks/useAppTheme';
import {
  formatPlannedWarmupSets,
  PlannedWarmupSet,
  plannedWarmupSetsEqual,
  warmupLoadTypesFor,
  WarmupLoadType,
  WeightedExerciseBlueprint,
} from '@/models/blueprint-models';
import { LoadUnit, shortFormatWeightUnit, Weight } from '@/models/weight';
import { localeFormatBigNumber } from '@/utils/locale-bignumber';
import { useTranslate } from '@tolgee/react';
import { useDismissLayer } from '@/hooks/useDismissLayer';
import BigNumber from 'bignumber.js';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

type PadField = 'load' | 'reps';

interface PadEditing {
  index: number;
  field: PadField;
}

export interface WarmupsEditorProps {
  exercise: WeightedExerciseBlueprint;
  update: (fn: (exercise: WeightedExerciseBlueprint) => WeightedExerciseBlueprint) => void;
  /** Today's heaviest working set, which percentages resolve against. Undefined in a routine or before any is set. */
  workingWeight: Weight | undefined;
  /** The empty bar in the preferred unit, which the presets open on. */
  bar: Weight;
  preferredUnit: LoadUnit;
  /** The weight step in `unit`, which resolved percentages round to and the pad's ± move by. */
  stepFor: (unit: LoadUnit) => BigNumber;
  /** Where the changes land: "Applies to today…". */
  scopeNote: string;
  onDone: () => void;
  bottomInset: number;
}

/**
 * The warm-up sheet's content (PM-47): the planned warm-ups as W1, W2… with load and reps typed on the
 * number pad, or one-tap ramps when there are none.
 */
export function WarmupsEditor(props: WarmupsEditorProps) {
  const { t } = useTranslate();
  const { tokens } = useAppTheme();
  const { exercise, update } = props;
  const warmups = exercise.warmupSets;
  const loadTypes = warmupLoadTypesFor(exercise.resistance);
  const [editing, setEditing] = useState<PadEditing>();
  const [buffer, setBuffer] = useState<NumberPadBuffer>(() => openNumberPad({ allowDecimal: false, step: 1 }));

  const loadUnitOf = (warmup: PlannedWarmupSet | undefined): LoadUnit =>
    warmup?.load?.type === 'absolute' && warmup.load.weight.unit !== 'nil'
      ? warmup.load.weight.unit
      : props.preferredUnit;

  const padFieldFor = (warmup: PlannedWarmupSet, field: PadField): NumberPadField => {
    if (field === 'reps') {
      return { placeholder: warmup.reps, allowDecimal: false, step: 1 };
    }
    if (warmup.load?.type === 'percent') {
      return { placeholder: warmup.load.percent, allowDecimal: false, step: 5 };
    }
    const unit = loadUnitOf(warmup);
    return {
      placeholder: warmup.load?.type === 'absolute' ? warmup.load.weight.value : undefined,
      allowDecimal: true,
      step: props.stepFor(unit),
    };
  };

  const typeInPad = (action: NumberPadAction) => {
    const next = numberPadReducer(buffer, action);
    setBuffer(next);
    if (!editing) {
      return;
    }
    const value = numberPadValue(next) ?? new BigNumber(0);
    const { index, field } = editing;
    update((current) =>
      field === 'reps'
        ? withWarmupRepsAt(current, index, value.integerValue(BigNumber.ROUND_HALF_UP).toNumber())
        : withWarmupLoadValue(current, index, value, loadUnitOf(current.warmupSets[index])),
    );
  };

  const openField = (index: number, field: PadField) => {
    const warmup = warmups[index];
    if (!warmup) {
      setEditing(undefined);
      return;
    }
    setEditing({ index, field });
    setBuffer(openNumberPad(padFieldFor(warmup, field)));
  };

  const closePad = () => {
    setEditing(undefined);
  };
  const padLayer = useDismissLayer(!!editing, closePad);

  /** Load then reps on each row, top to bottom. */
  const fields: PadEditing[] = warmups.flatMap((_, index) => [
    ...(loadTypes.length ? [{ index, field: 'load' as const }] : []),
    { index, field: 'reps' as const },
  ]);

  const nextField = () => {
    if (!editing) {
      return;
    }
    const at = fields.findIndex((f) => f.index === editing.index && f.field === editing.field);
    const following = fields[at + 1];
    if (following) {
      openField(following.index, following.field);
    } else {
      closePad();
    }
  };

  // Structural edits close the pad first, so it never types into a row that moved.
  const structural = (fn: (exercise: WeightedExerciseBlueprint) => WeightedExerciseBlueprint) => {
    closePad();
    haptics.selection();
    update(fn);
  };

  const switchLoadType = (type: WarmupLoadType) => {
    if (!editing) {
      return;
    }
    const { index } = editing;
    update((current) => withWarmupLoadTypeAt(current, index, type));
    // Switching type starts the load over (50%, or an empty weight), so the typed value can't change it.
    const warmup = withWarmupLoadTypeAt(exercise, index, type).warmupSets[index];
    if (warmup) {
      setBuffer(openNumberPad(padFieldFor(warmup, 'load')));
    }
  };

  const liveValue = (index: number, field: PadField) =>
    editing?.index === index && editing.field === field ? numberPadValue(buffer) : undefined;

  const editedWarmup = editing ? warmups[editing.index] : undefined;
  const padUnit =
    editing?.field === 'load' && editedWarmup?.load?.type !== 'percent' ? loadUnitOf(editedWarmup) : undefined;
  const percent = (value: number) => `${value}%`;
  const presetIs = (id: WarmupPresetId) =>
    plannedWarmupSetsEqual(warmups, warmupPresetSets(id, exercise.resistance, props.bar));

  return (
    <View style={{ flex: 1 }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: spacing[3],
          paddingTop: spacing[5],
          paddingBottom: spacing[2],
          paddingHorizontal: spacing.pageHorizontalMargin,
        }}
      >
        <View style={{ flex: 1, gap: spacing[0.5] }}>
          <SurfaceText font="text-xl" weight="700" accessibilityRole="header" style={{ color: tokens.ink }}>
            {t('exercise_editor.warmups.title')}
          </SurfaceText>
          {loadTypes.includes('percent') ? (
            <SurfaceText font="text-sm" style={{ color: tokens.muted }} testID="warmups-working-weight">
              {props.workingWeight
                ? workingWeightNote(t, props.workingWeight)
                : t('exercise_editor.warmups.working_weight_unknown.label')}
            </SurfaceText>
          ) : null}
        </View>
        <HeaderPillButton
          testID="warmups-done"
          label={t('exercise_editor.save.done.button')}
          onPress={() => padLayer.leave(props.onDone)}
        />
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1 }}>
        <DismissArea
          open={!!editing}
          onDismiss={closePad}
          style={{
            gap: spacing[4],
            paddingHorizontal: spacing.pageHorizontalMargin,
            paddingTop: spacing[2],
            paddingBottom: (editing ? spacing[4] : props.bottomInset) + spacing[4],
          }}
        >
          {warmups.length === 0 ? (
            <View style={{ gap: 10 }} testID="warmups-empty">
              <SurfaceText font="text-sm" style={{ color: tokens.muted }}>
                {t('exercise_editor.warmups.empty.body')}
              </SurfaceText>
              {WARMUP_PRESETS.map((preset) => (
                <PresetCard
                  key={preset.id}
                  testID={`warmups-preset-${preset.id}`}
                  name={t(preset.label)}
                  summary={formatPlannedWarmupSets(
                    warmupPresetSets(preset.id, exercise.resistance, props.bar),
                    percent,
                  )}
                  useLabel={t('exercise_editor.warmups.preset.use.button')}
                  onPress={() => structural((current) => withWarmupPreset(current, preset.id, props.bar))}
                />
              ))}
              <Pressable
                testID="warmups-add-first"
                accessibilityRole="button"
                onPress={() => structural(withWarmupAdded)}
                style={({ pressed }) => ({
                  minHeight: 52,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderStyle: 'dashed',
                  borderColor: tokens.line,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: pressed ? tokens.track : undefined,
                })}
              >
                <SurfaceText font="text-base" weight="500" style={{ color: tokens.accentInk }}>
                  {`+ ${t('exercise_editor.warmups.add_set.button')}`}
                </SurfaceText>
              </Pressable>
            </View>
          ) : (
            <>
              <View
                testID="warmups-table"
                style={{
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: tokens.line,
                  backgroundColor: tokens.card,
                  overflow: 'hidden',
                }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: spacing[3],
                    paddingHorizontal: spacing[4],
                    paddingVertical: 10,
                    backgroundColor: tokens.bg,
                    borderBottomWidth: StyleSheet.hairlineWidth,
                    borderBottomColor: tokens.line,
                  }}
                >
                  <ColumnLabel text={t('exercise_editor.warmups.column.set.label')} width={36} />
                  <ColumnLabel text={t('exercise_editor.warmups.column.load.label')} flex />
                  <ColumnLabel text={t('exercise_editor.warmups.column.reps.label')} width={72} center />
                  <View style={{ width: MIN_TOUCH_TARGET }} />
                </View>
                {warmups.map((warmup, index) => (
                  <WarmupRow
                    key={index}
                    index={index}
                    warmup={warmup}
                    hasLoad={loadTypes.length > 0}
                    liveLoad={liveValue(index, 'load')}
                    liveReps={liveValue(index, 'reps')}
                    editingField={editing?.index === index ? editing.field : undefined}
                    emptyBar={isEmptyBar(warmup, props.bar)}
                    resolved={resolvedWarmupWeight(
                      warmup,
                      props.workingWeight,
                      props.workingWeight && props.workingWeight.unit !== 'nil'
                        ? props.stepFor(props.workingWeight.unit)
                        : new BigNumber(0),
                    )}
                    unit={loadUnitOf(warmup)}
                    onLoad={() => openField(index, 'load')}
                    onReps={() => openField(index, 'reps')}
                    onRemove={() => structural((current) => withWarmupRemoved(current, index))}
                  />
                ))}
                <Pressable
                  testID="warmups-add"
                  accessibilityRole="button"
                  onPress={() => structural(withWarmupAdded)}
                  style={({ pressed }) => ({
                    minHeight: 48,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: pressed ? tokens.track : undefined,
                  })}
                >
                  <SurfaceText font="text-base" weight="500" style={{ color: tokens.accentInk }}>
                    {`+ ${t('exercise_editor.warmups.add.button')}`}
                  </SurfaceText>
                </Pressable>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: spacing[1] }}>
                <SurfaceText font="text-xs" style={{ color: tokens.muted, marginRight: spacing[1] }}>
                  {t('exercise_editor.warmups.replace.label')}
                </SurfaceText>
                {WARMUP_PRESETS.map((preset) => (
                  <Chip
                    key={preset.id}
                    testID={`warmups-replace-${preset.id}`}
                    label={t(preset.label)}
                    selected={presetIs(preset.id)}
                    onPress={() => structural((current) => withWarmupPreset(current, preset.id, props.bar))}
                  />
                ))}
              </View>
            </>
          )}

          <SurfaceText font="text-sm" style={{ color: tokens.muted }} testID="warmups-scope">
            {props.scopeNote}
          </SurfaceText>
        </DismissArea>
      </ScrollView>

      {editing?.field === 'load' && loadTypes.length > 1 && editedWarmup ? (
        <View style={{ paddingHorizontal: spacing.pageHorizontalMargin, paddingBottom: spacing[2] }}>
          <SegmentedControl
            testID="warmups-load-type"
            accessibilityLabel={t('exercise_editor.warmups.load_type.label')}
            value={editedWarmup.load?.type ?? 'absolute'}
            onChange={switchLoadType}
            options={[
              { value: 'percent', label: t('exercise_editor.warmups.load_type.percent.label') },
              { value: 'absolute', label: shortFormatWeightUnit(loadUnitOf(editedWarmup)) },
            ]}
          />
        </View>
      ) : null}
      <NumberPad
        visible={!!editing}
        buffer={buffer}
        onAction={typeInPad}
        unit={padUnit}
        accessory={undefined}
        primary="next"
        onPrimary={nextField}
        onHide={closePad}
        bottomInset={props.bottomInset}
      />
    </View>
  );
}

function WarmupRow(props: {
  index: number;
  warmup: PlannedWarmupSet;
  hasLoad: boolean;
  liveLoad: BigNumber | undefined;
  liveReps: BigNumber | undefined;
  editingField: PadField | undefined;
  emptyBar: boolean;
  resolved: Weight | undefined;
  unit: LoadUnit;
  onLoad: () => void;
  onReps: () => void;
  onRemove: () => void;
}) {
  const { t } = useTranslate();
  const { tokens } = useAppTheme();
  const { warmup, index } = props;
  const number = index + 1;
  const load = warmup.load;
  const loadText = (() => {
    const value = props.liveLoad;
    if (load?.type === 'percent') {
      return `${value ? value.toFixed() : load.percent}%`;
    }
    const weight = value ?? (load?.type === 'absolute' ? load.weight.value : undefined);
    return weight && weight.isGreaterThan(0)
      ? `${localeFormatBigNumber(weight)} ${shortFormatWeightUnit(load?.type === 'absolute' ? load.weight.unit : props.unit)}`
      : '–';
  })();
  const detail =
    props.editingField === 'load'
      ? undefined
      : props.resolved
        ? resolvedWeightNote(t, props.resolved)
        : props.emptyBar
          ? t('exercise_editor.warmups.empty_bar.label')
          : undefined;
  const reps = props.liveReps ? props.liveReps.toFixed() : String(warmup.reps);

  return (
    <View
      testID={`warmups-row-${index}`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing[3],
        paddingLeft: spacing[4],
        paddingRight: spacing[1],
        paddingVertical: spacing[2],
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: tokens.line,
      }}
    >
      <View
        accessible
        accessibilityLabel={t('exercise_editor.warmups.row.accessibility_label', { number })}
        style={{
          width: 36,
          height: 28,
          borderRadius: 8,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: tokens.accentSoft,
        }}
      >
        <SurfaceText font="text-sm" weight="700" numeric style={{ color: tokens.accentSoftInk }}>
          {t('exercise_editor.warmups.row.label', { number })}
        </SurfaceText>
      </View>
      {props.hasLoad ? (
        <Pressable
          testID={`warmups-load-${index}`}
          onPress={props.onLoad}
          accessibilityRole="button"
          accessibilityLabel={t('exercise_editor.warmups.load.accessibility_label', {
            number,
            load: [loadText, detail].filter(Boolean).join(' '),
          })}
          accessibilityState={{ selected: props.editingField === 'load' }}
          style={({ pressed }) => cellStyle(tokens, props.editingField === 'load', pressed, { flex: 1 })}
        >
          <View style={{ flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', columnGap: spacing[2] }}>
            <SurfaceText font="text-xl" numeric style={{ color: tokens.ink }}>
              {loadText}
            </SurfaceText>
            {detail ? (
              <SurfaceText font="text-sm" numeric style={{ color: tokens.muted }}>
                {detail}
              </SurfaceText>
            ) : null}
          </View>
        </Pressable>
      ) : (
        <SurfaceText font="text-sm" style={{ flex: 1, color: tokens.muted }}>
          {t('exercise_editor.warmups.reps_only.label')}
        </SurfaceText>
      )}
      <Pressable
        testID={`warmups-reps-${index}`}
        onPress={props.onReps}
        accessibilityRole="button"
        accessibilityLabel={t('exercise_editor.warmups.reps.accessibility_label', { number, reps })}
        accessibilityState={{ selected: props.editingField === 'reps' }}
        style={({ pressed }) =>
          cellStyle(tokens, props.editingField === 'reps', pressed, { width: 72, alignItems: 'center' })
        }
      >
        <SurfaceText font="text-xl" numeric style={{ color: tokens.ink }}>
          {reps}
        </SurfaceText>
      </Pressable>
      <Pressable
        testID={`warmups-remove-${index}`}
        onPress={props.onRemove}
        accessibilityRole="button"
        accessibilityLabel={t('exercise_editor.warmups.remove.accessibility_label', { number })}
        style={{ width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' }}
      >
        <MsIconSrc name="close" size={20} color={tokens.muted} />
      </Pressable>
    </View>
  );
}

/** A tappable number cell; the one the pad is typing into is outlined in the accent. */
function cellStyle(tokens: ReturnType<typeof useAppTheme>['tokens'], active: boolean, pressed: boolean, extra: object) {
  return {
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center' as const,
    paddingHorizontal: spacing[3],
    borderRadius: 10,
    borderWidth: active ? 2 : 1,
    borderColor: active ? tokens.accent : tokens.line,
    backgroundColor: pressed ? tokens.track : tokens.bg,
    ...extra,
  };
}

function ColumnLabel(props: { text: string; width?: number; flex?: boolean; center?: boolean }) {
  const { tokens } = useAppTheme();
  return (
    <SurfaceText
      font="text-sm"
      style={{
        color: tokens.muted,
        width: props.width,
        flex: props.flex ? 1 : undefined,
        textAlign: props.center ? 'center' : undefined,
      }}
    >
      {props.text}
    </SurfaceText>
  );
}

function PresetCard(props: { name: string; summary: string; useLabel: string; onPress: () => void; testID: string }) {
  const { tokens } = useAppTheme();
  return (
    <Pressable
      testID={props.testID}
      onPress={props.onPress}
      accessibilityRole="button"
      accessibilityLabel={`${props.name}, ${props.summary}`}
      accessibilityHint={props.useLabel}
      style={({ pressed }) => ({
        minHeight: 60,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing[3],
        paddingVertical: 10,
        paddingHorizontal: 14,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: tokens.line,
        backgroundColor: pressed ? tokens.track : tokens.bg,
      })}
    >
      <View style={{ flex: 1, gap: 3 }}>
        <SurfaceText font="text-base" weight="600" style={{ color: tokens.ink }}>
          {props.name}
        </SurfaceText>
        <SurfaceText font="text-sm" numeric style={{ color: tokens.muted }}>
          {props.summary}
        </SurfaceText>
      </View>
      <SurfaceText font="text-sm" weight="500" style={{ color: tokens.accentInk }}>
        {props.useLabel}
      </SurfaceText>
    </Pressable>
  );
}

/** The accent pill that closes the sheet, keeping what was changed. */
