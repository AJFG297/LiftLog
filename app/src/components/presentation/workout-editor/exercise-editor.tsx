import { Card } from '@/components/presentation/foundation/card';
import { ListRow } from '@/components/presentation/foundation/list-row';
import { MsIconSrc } from '@/components/presentation/foundation/ms-icon-source';
import { RoundIconButton } from '@/components/presentation/foundation/round-icon-button';
import { SegmentedControl } from '@/components/presentation/foundation/segmented-control';
import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { Switch } from '@/components/presentation/foundation/switch';
import { MIN_TOUCH_TARGET } from '@/components/presentation/foundation/touch-target';
import { CardioExerciseEditor } from '@/components/presentation/workout-editor/cardio-exercise-editor';
import {
  loadSummaryOf,
  progressionSummaryOf,
  supersetHintOf,
  TrackingType,
  trackingTypeOf,
  warmupsSummaryOf,
  withTrackingType,
} from '@/components/presentation/workout-editor/exercise-edit-copy';
import { ProgressionRulesEditor } from '@/components/presentation/workout-editor/progressive-overload';
import { RestEditorDialog } from '@/components/presentation/workout-editor/rest-editor-dialog';
import { WarmupSetsEditor } from '@/components/presentation/workout-editor/warmup-sets-editor';
import {
  targetsModeOf,
  targetsSummaryOf,
  withAddedSet,
  withoutSet,
  withTargetsMode,
} from '@/components/presentation/workout-editor/exercise-targets';
import {
  TargetsPadControl,
  WeightedTargetsEditor,
} from '@/components/presentation/workout-editor/weighted-targets-editor';
import { fontFamily, spacing, useAppTheme } from '@/hooks/useAppTheme';
import { CardioExerciseBlueprint, ExerciseBlueprint, WeightedExerciseBlueprint } from '@/models/blueprint-models';
import { formatTimeSpan } from '@/utils/format-time-span';
import { useTranslate } from '@tolgee/react';
import BigNumber from 'bignumber.js';
import { ReactNode, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

export interface ExerciseEditorProps {
  exercise: ExerciseBlueprint;
  /** Applies a change to the exercise being edited; where it lands is the caller's business. */
  update: (update: (exercise: ExerciseBlueprint) => ExerciseBlueprint) => void;
  /** Where the edit lands, in one line: "Changes apply to today only…". */
  scopeSentence: string;
  /** "Barbell · Chest, triceps, shoulders", when the catalog knows the exercise. */
  meta: string | undefined;
  /** The exercise after this one, which Superset with next pairs it with. Undefined for the last one. */
  nextExerciseName: string | undefined;
  restTimersEnabled: boolean;
  /** A weight step with its unit, "2.5 kg". */
  formatStep: (step: BigNumber) => string;
  onSwap: () => void;
  onOpenLoad: () => void;
  /** The Targets card's number pad, which the sheet mounts under the cards. */
  targets: TargetsPadControl;
}

/**
 * Today's controls for the rows that will get sheets of their own (PM-46 rest, PM-47 warm-ups, PM-48
 * progression). Until then a row opens its control in place.
 */
type InlinePanel = 'warmups' | 'progression';

/**
 * The edit exercise screen's content (PM-43): the scope, then the Exercise, Targets, How it runs and Notes
 * cards. The sheet around it supplies the header with the save button.
 */
export function ExerciseEditor(props: ExerciseEditorProps) {
  const { t } = useTranslate();
  const { exercise, update } = props;
  const updateWeighted = (fn: (exercise: WeightedExerciseBlueprint) => WeightedExerciseBlueprint) =>
    update((current) => (current instanceof WeightedExerciseBlueprint ? fn(current) : current));
  const updateCardio = (partial: Partial<CardioExerciseBlueprint>) =>
    update((current) => (current instanceof CardioExerciseBlueprint ? current.with(partial) : current));

  return (
    <View style={{ gap: spacing[5] }}>
      <ScopeLine sentence={props.scopeSentence} />
      <ExerciseCard
        exercise={exercise}
        meta={props.meta}
        onSwap={props.onSwap}
        onTrackingChange={(type) => {
          props.targets.dispatch({ type: 'close' });
          update((current) => withTrackingType(current, type));
        }}
      />
      {exercise instanceof WeightedExerciseBlueprint ? (
        <WeightedSections {...props} exercise={exercise} updateWeighted={updateWeighted} />
      ) : (
        <Section title={t('exercise_editor.targets.title')}>
          <Card style={{ paddingHorizontal: spacing[2] }}>
            <CardioExerciseEditor
              exercise={exercise}
              updateExercise={(partial) => updateCardio(partial as Partial<CardioExerciseBlueprint>)}
            />
          </Card>
        </Section>
      )}
      <NotesCard
        notes={exercise.notes}
        link={exercise.link}
        onNotesChange={(notes) => update((current) => withNotes(current, { notes }))}
        onLinkChange={(link) => update((current) => withNotes(current, { link }))}
      />
    </View>
  );
}

function withNotes(exercise: ExerciseBlueprint, change: { notes?: string; link?: string }): ExerciseBlueprint {
  return exercise instanceof WeightedExerciseBlueprint ? exercise.with(change) : exercise.with(change);
}

function ScopeLine({ sentence }: { sentence: string }) {
  const { tokens } = useAppTheme();
  return (
    <View
      testID="exercise-editor-scope"
      accessible
      style={{
        flexDirection: 'row',
        gap: 10,
        alignItems: 'flex-start',
        paddingVertical: spacing[3],
        paddingHorizontal: 14,
        borderRadius: 12,
        backgroundColor: tokens.segment,
      }}
    >
      <View style={{ paddingTop: 1 }}>
        <MsIconSrc name="info" size={18} color={tokens.muted} />
      </View>
      <SurfaceText font="text-sm" style={{ flex: 1, color: tokens.ink }}>
        {sentence}
      </SurfaceText>
    </View>
  );
}

function ExerciseCard(props: {
  exercise: ExerciseBlueprint;
  meta: string | undefined;
  onSwap: () => void;
  onTrackingChange: (type: TrackingType) => void;
}) {
  const { t } = useTranslate();
  const { tokens } = useAppTheme();
  return (
    <Card style={{ gap: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing[3] }}>
        <View accessible accessibilityRole="header" style={{ flex: 1, gap: spacing[1] }}>
          <SurfaceText font="text-xl" weight="700" style={{ color: tokens.ink }} testID="exercise-editor-name">
            {props.exercise.name}
          </SurfaceText>
          {props.meta ? (
            <SurfaceText font="text-sm" style={{ color: tokens.muted }}>
              {props.meta}
            </SurfaceText>
          ) : null}
        </View>
        <RoundIconButton
          icon="swapHoriz"
          size="compact"
          label={t('exercise_editor.swap.button')}
          accessibilityLabel={t('exercise_editor.swap.accessibility_label', { name: props.exercise.name })}
          onPress={props.onSwap}
          testID="exercise-editor-swap"
        />
      </View>
      <SegmentedControl
        testID="exercise-tracking"
        accessibilityLabel={t('exercise_editor.tracking.label')}
        value={trackingTypeOf(props.exercise)}
        onChange={props.onTrackingChange}
        options={[
          { value: 'weighted', label: t('exercise_editor.tracking.weighted.label') },
          { value: 'cardio', label: t('exercise_editor.tracking.cardio.label') },
        ]}
      />
    </Card>
  );
}

function WeightedSections(
  props: ExerciseEditorProps & {
    exercise: WeightedExerciseBlueprint;
    updateWeighted: (fn: (exercise: WeightedExerciseBlueprint) => WeightedExerciseBlueprint) => void;
  },
) {
  const { t } = useTranslate();
  const { exercise, updateWeighted } = props;
  const [panel, setPanel] = useState<InlinePanel | undefined>();
  const [restOpen, setRestOpen] = useState(false);
  const toggle = (next: InlinePanel) => setPanel((open) => (open === next ? undefined : next));
  const rest = exercise.restBetweenSets;
  // Only the targets persist, so a uniform list cannot say whether it was authored as fixed or as a
  // range; the chosen layout lives here for as long as the editor is open.
  const [targetsMode, setTargetsMode] = useState(() => targetsModeOf(exercise));
  const closePad = () => props.targets.dispatch({ type: 'close' });

  return (
    <>
      <Section title={t('exercise_editor.targets.title')} aside={targetsSummaryOf(exercise, targetsMode)}>
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <WeightedTargetsEditor
            exercise={exercise}
            mode={targetsMode}
            onModeChange={(mode) => {
              closePad();
              if (mode !== targetsMode) {
                setTargetsMode(mode);
                updateWeighted((current) => withTargetsMode(current, mode));
              }
            }}
            targets={props.targets}
            onAddSet={() => {
              closePad();
              updateWeighted(withAddedSet);
            }}
            onRemoveSet={(index) => {
              closePad();
              updateWeighted((current) => withoutSet(current, index));
            }}
          />
          <RowDivider />
          <EditorRow
            testID="exercise-editor-warmups"
            title={t('exercise_editor.warmups.title')}
            subtitle={warmupsSummaryOf(t, exercise.warmupSets)}
            expanded={panel === 'warmups'}
            onPress={() => toggle('warmups')}
          />
          {panel === 'warmups' ? (
            <View style={{ paddingHorizontal: spacing[4], paddingBottom: spacing[3] }}>
              <WarmupSetsEditor
                exercise={exercise}
                updateWarmupSets={(warmupSets) => updateWeighted((current) => current.with({ warmupSets }))}
              />
            </View>
          ) : null}
        </Card>
      </Section>

      <Section title={t('exercise_editor.how_it_runs.title')}>
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {props.restTimersEnabled ? (
            <>
              <EditorRow
                testID="exercise-editor-rest"
                title={t('exercise_editor.rest.title')}
                subtitle={t('exercise_editor.rest.failure.label', { rest: formatTimeSpan(rest.failureRest) })}
                value={formatTimeSpan(rest.minRest)}
                onPress={() => setRestOpen(true)}
              />
              <RowDivider />
            </>
          ) : null}
          <EditorRow
            testID="exercise-editor-progression"
            title={t('exercise_editor.progression.title')}
            subtitle={progressionSummaryOf(t, exercise, props.formatStep)}
            expanded={panel === 'progression'}
            onPress={() => toggle('progression')}
          />
          {panel === 'progression' ? (
            <View style={{ paddingHorizontal: spacing[4], paddingBottom: spacing[3] }}>
              <ProgressionRulesEditor
                exercise={exercise}
                onChange={(progression) => updateWeighted((current) => current.with({ progression }))}
              />
            </View>
          ) : null}
          <RowDivider />
          <EditorRow
            testID="exercise-editor-load"
            title={t('exercise_editor.load.title')}
            subtitle={loadSummaryOf(t, exercise.resistance)}
            onPress={props.onOpenLoad}
          />
          <RowDivider />
          <SupersetRow
            on={exercise.supersetWithNext}
            nextExerciseName={props.nextExerciseName}
            onChange={(supersetWithNext) => updateWeighted((current) => current.with({ supersetWithNext }))}
          />
        </Card>
      </Section>

      {props.restTimersEnabled ? (
        <RestEditorDialog
          rest={rest}
          onRestUpdated={(restBetweenSets) => updateWeighted((current) => current.with({ restBetweenSets }))}
          dialogOpen={restOpen}
          setDialogOpen={setRestOpen}
        />
      ) : null}
    </>
  );
}

function SupersetRow(props: { on: boolean; nextExerciseName: string | undefined; onChange: (on: boolean) => void }) {
  const { t } = useTranslate();
  const title = t('exercise_editor.superset.title');
  const hint = supersetHintOf(t, props.nextExerciseName, props.on);
  // The last exercise has nothing to pair with, but one already marked can still be turned off.
  const disabled = props.nextExerciseName === undefined && !props.on;
  return (
    <ListRow
      testID="exercise-superset-row"
      title={title}
      subtitle={hint}
      accessibilityLabel={`${title}, ${hint}`}
      onPress={() => {
        if (!disabled) {
          props.onChange(!props.on);
        }
      }}
      style={{ minHeight: spacing[16] }}
      trailing={
        <Switch value={props.on} disabled={disabled} testID="exercise-superset" onValueChange={props.onChange} />
      }
    />
  );
}

function NotesCard(props: {
  notes: string;
  link: string;
  onNotesChange: (notes: string) => void;
  onLinkChange: (link: string) => void;
}) {
  const { t } = useTranslate();
  const { tokens } = useAppTheme();
  const input = { fontFamily: fontFamily.text, fontSize: 15, color: tokens.ink, padding: 0 } as const;
  return (
    <Section title={t('exercise_editor.notes.title')}>
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <TextInput
          testID="exercise-notes"
          multiline
          value={props.notes}
          onChangeText={props.onNotesChange}
          placeholder={t('exercise_editor.notes.placeholder')}
          placeholderTextColor={tokens.placeholder}
          accessibilityLabel={t('exercise_editor.notes.title')}
          style={[
            input,
            {
              minHeight: 64,
              lineHeight: 21,
              paddingHorizontal: spacing[4],
              paddingVertical: 14,
              textAlignVertical: 'top',
            },
          ]}
        />
        <RowDivider />
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            paddingHorizontal: spacing[4],
            minHeight: 48,
          }}
        >
          <MsIconSrc name="link" size={18} color={tokens.muted} />
          <TextInput
            testID="exercise-link"
            value={props.link}
            onChangeText={props.onLinkChange}
            placeholder={t('exercise_editor.link.placeholder')}
            placeholderTextColor={tokens.placeholder}
            accessibilityLabel={t('exercise_editor.link.label')}
            keyboardType="url"
            autoCapitalize="none"
            autoCorrect={false}
            style={[input, { flex: 1, minWidth: 0, minHeight: MIN_TOUCH_TARGET }]}
          />
        </View>
      </Card>
    </Section>
  );
}

/** A card's heading above it, in small capitals: "TARGETS", "HOW IT RUNS". */
function Section({ title, aside, children }: { title: string; aside?: string; children: ReactNode }) {
  const { tokens } = useAppTheme();
  const heading = (
    <SurfaceText
      font="text-sm"
      weight="600"
      accessibilityRole="header"
      style={{ paddingHorizontal: spacing[1], textTransform: 'uppercase', letterSpacing: 0.8, color: tokens.muted }}
    >
      {title}
    </SurfaceText>
  );
  return (
    <View style={{ gap: spacing[2] }}>
      {aside === undefined ? (
        heading
      ) : (
        // A summary on the heading's line, such as the targets' "3 × 8–12".
        <View
          style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing[3] }}
        >
          {heading}
          <SurfaceText
            numeric
            font="text-sm"
            numberOfLines={1}
            testID="exercise-targets-summary"
            style={{ flexShrink: 1, paddingHorizontal: spacing[1], color: tokens.muted }}
          >
            {aside}
          </SurfaceText>
        </View>
      )}
      {children}
    </View>
  );
}

/**
 * A setting summarised on one row that opens its control: a title, what it is set to, and an optional
 * value on the right, such as the rest time.
 */
function EditorRow(props: {
  title: string;
  subtitle: string;
  value?: string;
  /** For a row that opens its control in place rather than in a sheet. */
  expanded?: boolean;
  onPress: () => void;
  testID: string;
}) {
  const { tokens } = useAppTheme();
  return (
    <Pressable
      testID={props.testID}
      onPress={props.onPress}
      accessibilityRole="button"
      accessibilityLabel={[props.title, props.value, props.subtitle].filter(Boolean).join(', ')}
      accessibilityState={props.expanded === undefined ? undefined : { expanded: props.expanded }}
      style={({ pressed }) => ({
        minHeight: spacing[16],
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing[4],
        paddingVertical: 10,
        paddingHorizontal: spacing[4],
        backgroundColor: pressed ? tokens.track : undefined,
      })}
    >
      <View style={{ flex: 1, gap: spacing[0.5] }}>
        <SurfaceText font="text-base" style={{ color: tokens.ink }}>
          {props.title}
        </SurfaceText>
        <SurfaceText font="text-sm" style={{ color: tokens.muted }}>
          {props.subtitle}
        </SurfaceText>
      </View>
      {props.value ? (
        <SurfaceText font="text-lg" numeric style={{ color: tokens.ink }}>
          {props.value}
        </SurfaceText>
      ) : null}
      <View style={{ transform: [{ rotate: props.expanded ? '90deg' : '0deg' }] }}>
        <MsIconSrc name="chevronRight" size={18} color={tokens.muted} />
      </View>
    </Pressable>
  );
}

function RowDivider() {
  const { tokens } = useAppTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: tokens.line }} />;
}
