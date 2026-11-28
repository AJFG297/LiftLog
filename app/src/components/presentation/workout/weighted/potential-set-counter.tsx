import { PotentialSet, WeightAppliesTo } from '@/models/session-models';
import { Resistance, RepsTarget } from '@/models/blueprint-models';
import BigNumber from 'bignumber.js';
import { useEffect, useState } from 'react';
import { Chip } from '@/components/presentation/foundation/chip';
import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { Keyboard, View } from 'react-native';
import WeightDialog from '@/components/presentation/foundation/editors/weight-dialog';
import { spacing, rounding } from '@/hooks/useAppTheme';
import FocusRing from '@/components/presentation/foundation/focus-ring';
import { T, useTranslate } from '@tolgee/react';
import Holdable from '@/components/presentation/foundation/holdable';
import { Weight } from '@/models/weight';
import PotentialSetAdditionalActionsDialog from '@/components/presentation/workout/weighted/potential-sets-addition-actions-dialog';
import { PotentialSetDisplay } from '@/components/presentation/workout/weighted/potential-set-display';
import { WarmupTile } from '@/components/presentation/workout/weighted/warmup-tile';
import { RpePickerDialog } from '@/components/presentation/workout/weighted/rpe-picker';
import { Rpe } from '@/models/session-models/rpe';

interface PotentialSetCounterProps {
  set: PotentialSet;
  weightIncrement: BigNumber;
  repsTarget: RepsTarget;
  previousRepCount: number | undefined;
  toStartNext: boolean;
  isReadonly: boolean;
  resistance: Resistance;

  onTap: () => void;
  onUpdateWeight: (weight: Weight, applyTo: WeightAppliesTo) => void;
  onUpdateReps: (reps: number | undefined) => void;

  showRpe: boolean;
  rpe: Rpe | undefined;
  /** `undefined` when RPE can't be edited here: the row still shows, it just isn't tappable. */
  onUpdateRpe: ((rpe: Rpe | undefined) => void) | undefined;

  /**
   * Set for a warm-up. Its weight edit only ever touches this set in this session, so the dialog offers
   * no "apply to" choice and `onUpdateWeight` always gets `'thisSet'`.
   */
  warmup?: WarmupTile | undefined;
}

export default function PotentialSetCounter(props: PotentialSetCounterProps) {
  const { t } = useTranslate();
  const [isWeightDialogOpen, setIsWeightDialogOpen] = useState(false);
  const [isRepsDialogOpen, setIsRepsDialogOpen] = useState(false);
  const [isRpeDialogOpen, setIsRpeDialogOpen] = useState(false);
  const onUpdateRpe = props.onUpdateRpe;
  const maxReps = props.repsTarget.max;

  useEffect(() => {
    if (!isRepsDialogOpen) {
      Keyboard.dismiss();
    }
  }, [isRepsDialogOpen]);
  const [applyTo, setApplyTo] = useState<WeightAppliesTo>('uncompletedSets');

  return (
    <Holdable disabled={props.isReadonly} onLongPress={() => setIsRepsDialogOpen(true)}>
      <FocusRing isSelected={props.toStartNext} radius={rounding.roundedRectangleFocusRingRadius}>
        <PotentialSetDisplay
          set={props.set}
          repsTarget={props.repsTarget}
          resistance={props.resistance}
          previousRepCount={props.previousRepCount}
          showRpe={props.showRpe}
          rpe={props.rpe}
          warmup={props.warmup}
          onPressRpe={onUpdateRpe && !props.isReadonly ? () => setIsRpeDialogOpen(true) : undefined}
          onPressReps={props.isReadonly ? undefined : props.onTap}
          onPressWeight={
            props.isReadonly
              ? undefined
              : () => {
                  setApplyTo(props.set.set ? 'thisSet' : 'uncompletedSets');
                  setIsWeightDialogOpen(true);
                }
          }
        />
        <WeightDialog
          open={isWeightDialogOpen}
          allowNegative={!props.warmup}
          increment={props.weightIncrement}
          weight={props.set.weight}
          onClose={() => setIsWeightDialogOpen(false)}
          updateWeight={(w) => props.onUpdateWeight(w, props.warmup ? 'thisSet' : applyTo)}
        >
          {props.warmup ? (
            <SurfaceText font="text-sm">
              <T keyName="workout.warmup_set.weight_session_only.body" />
            </SurfaceText>
          ) : (
            <View style={{ gap: spacing[2] }}>
              <SurfaceText font="text-sm" weight="500">
                <T keyName="weight.apply_to.label" />
              </SurfaceText>
              <View
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  gap: spacing[1],
                }}
              >
                <Chip
                  label={t('exercise.this_set.label')}
                  selected={applyTo === 'thisSet'}
                  testID="repcount-apply-weight-to-this-set"
                  onPress={() => setApplyTo('thisSet')}
                />
                <Chip
                  label={t('exercise.uncompleted_sets.label')}
                  selected={applyTo === 'uncompletedSets'}
                  testID="repcount-apply-weight-to-uncompleted-sets"
                  onPress={() => setApplyTo('uncompletedSets')}
                />
                <Chip
                  label={t('exercise.all_sets.label')}
                  selected={applyTo === 'allSets'}
                  testID="repcount-apply-weight-to-all-sets"
                  onPress={() => setApplyTo('allSets')}
                />
              </View>
            </View>
          )}
        </WeightDialog>
      </FocusRing>

      <PotentialSetAdditionalActionsDialog
        open={isRepsDialogOpen}
        repTarget={maxReps}
        set={props.set}
        updateRepCount={(reps) => props.onUpdateReps(reps)}
        rpe={props.rpe}
        updateRpe={onUpdateRpe}
        close={() => setIsRepsDialogOpen(false)}
      />
      {onUpdateRpe && (
        <RpePickerDialog
          open={isRpeDialogOpen}
          value={props.rpe}
          onChange={onUpdateRpe}
          close={() => setIsRpeDialogOpen(false)}
        />
      )}
    </Holdable>
  );
}
