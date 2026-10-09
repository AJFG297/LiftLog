import { Chip } from '@/components/presentation/foundation/chip';
import { RadioMark } from '@/components/presentation/foundation/radio-mark';
import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { MIN_TOUCH_TARGET } from '@/components/presentation/foundation/touch-target';
import { progressionPreview, type PreviewRow } from '@/components/presentation/workout-editor/progression-preview';
import {
  previewNoteOf,
  progressionOptionBody,
  repsTargetText,
  rulesSummaryOf,
} from '@/components/presentation/workout-editor/progression-sheet-copy';
import { ProgressionRulesEditor } from '@/components/presentation/workout-editor/progressive-overload';
import {
  ladderCeilingChoices,
  ladderCeilingFor,
  offersProgressionPresets,
  presetLoadStep,
  PROGRESSION_PRESETS,
  type ProgressionPreset,
  progressionChoiceOf,
  rulesForPreset,
  withLadderCeiling,
  withProgressionStep,
  stepChoices,
} from '@/components/presentation/workout-editor/routine-progression';
import { spacing, useAppTheme } from '@/hooks/useAppTheme';
import type { TranslateFn } from '@/i18n/translate-fn';
import { ProgressionRule, uniformTarget, WeightedExerciseBlueprint } from '@/models/blueprint-models';
import { RecordedWeightedExercise } from '@/models/session-models';
import { WeightUnit } from '@/models/weight';
import { useTranslate } from '@tolgee/react';
import BigNumber from 'bignumber.js';
import { ReactNode, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

export interface ProgressionSheetContentProps {
  exercise: WeightedExerciseBlueprint;
  /** The step a preset adds when the exercise has none yet, such as the equipment's. */
  fallbackStep: BigNumber;
  /** A weight step with its unit, "2.5 kg". */
  formatStep: (step: BigNumber) => string;
  /** A weight with its unit, "102.5 kg". */
  formatWeight: (weight: BigNumber) => string;
  /** The complete exercise next time opens on, including earned progression. */
  nextExercise: RecordedWeightedExercise;
  weightKnown: boolean;
  unit: WeightUnit;
  onChange: (progression: ProgressionRule[]) => void;
}

/**
 * The progression sheet's content (PM-48): Add weight, Reps then weight or Off as radio cards explained
 * with the exercise's numbers, the picked one's step and rep limit as chips, what the next sessions look
 * like if every target is hit, and the full rule list under Rules for anything else.
 */
export function ProgressionSheetContent(props: ProgressionSheetContentProps) {
  const { t } = useTranslate();
  const { exercise } = props;
  const choice = progressionChoiceOf(exercise.progression);
  const presets = offersProgressionPresets(exercise);
  const preview = progressionPreview(props.nextExercise, props.unit);

  return (
    <View style={{ gap: spacing[4] }}>
      {presets ? (
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel={t('progression_sheet.choices.label')}
          style={{ gap: 8 }}
        >
          {PROGRESSION_PRESETS.map((preset) => (
            <ChoiceCard
              key={preset}
              testID={`progression-${preset}`}
              name={t(PRESET_LABELS[preset])}
              body={progressionOptionBody(t, preset, exercise, props.fallbackStep, props.formatStep)}
              selected={choice === preset}
              onPress={() => {
                if (choice !== preset) {
                  props.onChange(rulesForPreset(preset, exercise, props.fallbackStep));
                }
              }}
            >
              {choice === preset ? <PresetOptions {...props} preset={preset} /> : null}
            </ChoiceCard>
          ))}
          {choice === 'custom' ? (
            <ChoiceCard
              testID="progression-custom"
              name={t('routine_editor.progression.custom.label')}
              body={t('progression_sheet.custom.body')}
              selected
              onPress={() => {}}
            />
          ) : null}
        </View>
      ) : null}

      {preview.length ? (
        <PreviewTable
          rows={preview}
          note={previewNoteOf(t, exercise)}
          showWeight={exercise.resistance !== 'none'}
          weightKnown={props.weightKnown}
          formatWeight={props.formatWeight}
          formatStep={props.formatStep}
        />
      ) : null}

      <RulesCard exercise={exercise} alwaysOpen={!presets} onChange={props.onChange} />
    </View>
  );
}

const PRESET_LABELS = {
  weight: 'routine_editor.progression.weight.label',
  double: 'routine_editor.progression.double.label',
  off: 'routine_editor.progression.off.label',
} as const;

/** The picked card's inline settings: the rep limit for Reps then weight, and the weight step. */
function PresetOptions(props: ProgressionSheetContentProps & { preset: ProgressionPreset }) {
  const { t } = useTranslate();
  const { exercise } = props;
  if (props.preset === 'off') {
    return null;
  }
  const step = presetLoadStep(exercise, props.fallbackStep);
  const ceiling = ladderCeilingFor(exercise);
  return (
    <View style={{ gap: spacing[1], paddingLeft: 34 }}>
      {props.preset === 'double' ? (
        <ChipLine label={t('progression_sheet.ceiling.label')}>
          {ladderCeilingChoices(exercise, ceiling).map((choice) => (
            <Chip
              key={choice.toString()}
              testID={`progression-ceiling-${choice.toString()}`}
              numeric
              label={choice.toString()}
              accessibilityLabel={t('progression_sheet.ceiling.accessibility_label', { reps: choice.toNumber() })}
              selected={choice.isEqualTo(ceiling)}
              onPress={() => props.onChange(withLadderCeiling(exercise, choice).progression)}
            />
          ))}
        </ChipLine>
      ) : null}
      <ChipLine label={t('progression_sheet.step.label')}>
        {stepChoices(step).map((choice) => (
          <Chip
            key={choice.toString()}
            testID={`progression-step-${choice.toString()}`}
            numeric
            label={props.formatStep(choice)}
            accessibilityLabel={t('progression_sheet.step.accessibility_label', { step: props.formatStep(choice) })}
            selected={choice.isEqualTo(step)}
            onPress={() => props.onChange(withProgressionStep(exercise, choice).progression)}
          />
        ))}
      </ChipLine>
    </View>
  );
}

function ChipLine({ label, children }: { label: string; children: ReactNode }) {
  const { tokens } = useAppTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
      <SurfaceText font="text-sm" style={{ minWidth: 52, color: tokens.muted }}>
        {label}
      </SurfaceText>
      {children}
    </View>
  );
}

/** One choice: a radio, the name and what it does, and the picked one's settings under them. */
function ChoiceCard(props: {
  name: string;
  body: string;
  selected: boolean;
  onPress: () => void;
  children?: ReactNode;
  testID: string;
}) {
  const { tokens } = useAppTheme();
  return (
    <View
      style={{
        borderRadius: 14,
        borderWidth: props.selected ? 2 : 1,
        // Keeps the card the same size when the thicker border comes and goes.
        margin: props.selected ? 0 : 1,
        borderColor: props.selected ? tokens.ink : tokens.line,
        backgroundColor: tokens.card,
        paddingBottom: props.children ? spacing[2] : 0,
      }}
    >
      <Pressable
        testID={props.testID}
        accessibilityRole="radio"
        accessibilityState={{ checked: props.selected }}
        accessibilityLabel={`${props.name}. ${props.body}`}
        onPress={props.onPress}
        style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing[3], padding: 14 }}
      >
        <RadioMark selected={props.selected} color={tokens.ink} style={{ marginTop: 1 }} />
        <View style={{ flex: 1, gap: 3 }}>
          <SurfaceText font="text-base" weight="600" style={{ color: tokens.ink }}>
            {props.name}
          </SurfaceText>
          <SurfaceText font="text-sm" style={{ color: tokens.muted }}>
            {props.body}
          </SurfaceText>
        </View>
      </Pressable>
      {props.children ? <View style={{ paddingHorizontal: 14 }}>{props.children}</View> : null}
    </View>
  );
}

/** "If you hit every target": next time, then each session after it, with what moved highlighted. */
function PreviewTable(props: {
  rows: PreviewRow[];
  note: string;
  showWeight: boolean;
  weightKnown: boolean;
  formatWeight: (weight: BigNumber) => string;
  formatStep: (step: BigNumber) => string;
}) {
  const { t } = useTranslate();
  const { tokens } = useAppTheme();
  return (
    <View style={{ gap: spacing[2] }} testID="progression-preview">
      <SurfaceText
        font="text-sm"
        weight="600"
        accessibilityRole="header"
        style={{ paddingHorizontal: spacing[1], textTransform: 'uppercase', letterSpacing: 0.8, color: tokens.muted }}
      >
        {t('progression_sheet.preview.title')}
      </SurfaceText>
      <View style={{ borderWidth: 1, borderColor: tokens.line, borderRadius: 14, overflow: 'hidden' }}>
        {props.rows.map((row, index) => {
          const cells = previewCells(t, row, props);
          return (
            <View
              key={index}
              accessible
              accessibilityLabel={
                row.kind === 'gap'
                  ? t('progression_sheet.preview.gap.accessibility_label')
                  : [cells.when, cells.weight, cells.reps, cells.tag].filter(Boolean).join(', ')
              }
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                minHeight: MIN_TOUCH_TARGET,
                paddingHorizontal: 14,
                borderTopWidth: index > 0 ? StyleSheet.hairlineWidth : 0,
                borderColor: tokens.line,
                backgroundColor: cells.tag ? tokens.wash : undefined,
              }}
            >
              <SurfaceText font="text-sm" style={{ width: 76, color: tokens.muted }}>
                {cells.when}
              </SurfaceText>
              {cells.weight ? (
                <SurfaceText font="text-base" numeric style={{ color: tokens.ink }}>
                  {cells.weight}
                </SurfaceText>
              ) : null}
              <SurfaceText font="text-base" numeric style={{ flexShrink: 1, color: tokens.muted }}>
                {cells.reps}
              </SurfaceText>
              {cells.tag ? (
                <SurfaceText font="text-sm" weight="600" style={{ marginLeft: 'auto', color: tokens.accentInk }}>
                  {cells.tag}
                </SurfaceText>
              ) : null}
            </View>
          );
        })}
      </View>
      <SurfaceText font="text-sm" style={{ paddingHorizontal: spacing[1], color: tokens.muted }}>
        {props.note}
      </SurfaceText>
    </View>
  );
}

function previewCells(
  t: TranslateFn,
  row: PreviewRow,
  props: {
    showWeight: boolean;
    weightKnown: boolean;
    formatWeight: (weight: BigNumber) => string;
    formatStep: (step: BigNumber) => string;
  },
): { when: string; weight?: string; reps?: string; tag?: string } {
  if (row.kind === 'gap') {
    return { when: '…' };
  }
  const uniform = uniformTarget(row.reps.map((reps) => ({ reps })));
  const reps = (uniform ? [uniform] : row.reps).map(repsTargetText).join(', ');
  // Before the exercise has a weight, the preview can only say how much it has added.
  const weight = !props.showWeight
    ? undefined
    : props.weightKnown
      ? props.formatWeight(row.weight)
      : row.weight.isZero()
        ? t('progression_sheet.preview.start.label')
        : `+${props.formatStep(row.weight)}`;
  return {
    when:
      row.after === 0
        ? t('progression_sheet.preview.next.label')
        : t('progression_sheet.preview.after.label', { count: row.after }),
    weight,
    reps: props.showWeight ? `× ${reps}` : reps,
    tag: !row.change
      ? undefined
      : row.change.axis === 'load'
        ? t('progression_sheet.preview.load_change.label', { amount: props.formatStep(row.change.amount) })
        : t(
            row.change.amount.isEqualTo(1)
              ? 'progression_sheet.preview.reps_change_one.label'
              : 'progression_sheet.preview.reps_change_many.label',
            { count: row.change.amount.toNumber() },
          ),
  };
}

/**
 * Rules, collapsed to a count: the full rule editor for anything the choices do not cover. Editing it
 * makes the choice Custom unless the rules land back on a preset's shape. Open from the start for an
 * exercise with no weight, which gets no choices.
 */
function RulesCard(props: {
  exercise: WeightedExerciseBlueprint;
  alwaysOpen: boolean;
  onChange: (progression: ProgressionRule[]) => void;
}) {
  const { t } = useTranslate();
  const { tokens } = useAppTheme();
  const [open, setOpen] = useState(false);
  const expanded = open || props.alwaysOpen;
  return (
    <View style={{ borderWidth: 1, borderColor: tokens.line, borderRadius: 14, overflow: 'hidden' }}>
      <Pressable
        testID="progression-rules-toggle"
        disabled={props.alwaysOpen}
        onPress={() => setOpen((was) => !was)}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${t('progression_sheet.rules.title')}, ${rulesSummaryOf(t, props.exercise.progression)}`}
        style={({ pressed }) => ({
          minHeight: 52,
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing[3],
          paddingHorizontal: 14,
          paddingVertical: spacing[2],
          backgroundColor: pressed ? tokens.track : undefined,
        })}
      >
        <View style={{ flex: 1, gap: 2 }}>
          <SurfaceText font="text-base" style={{ color: tokens.ink }}>
            {t('progression_sheet.rules.title')}
          </SurfaceText>
          <SurfaceText font="text-sm" style={{ color: tokens.muted }}>
            {rulesSummaryOf(t, props.exercise.progression)}
          </SurfaceText>
        </View>
        {props.alwaysOpen ? null : (
          <SurfaceText font="text-sm" weight="600" style={{ color: tokens.accentInk }}>
            {t(expanded ? 'progression_sheet.rules.hide.button' : 'progression_sheet.rules.edit.button')}
          </SurfaceText>
        )}
      </Pressable>
      {expanded ? (
        <View
          style={{
            borderTopWidth: StyleSheet.hairlineWidth,
            borderColor: tokens.line,
            paddingHorizontal: 14,
            paddingVertical: spacing[3],
          }}
        >
          <ProgressionRulesEditor exercise={props.exercise} onChange={props.onChange} hideExample />
        </View>
      ) : null}
    </View>
  );
}
