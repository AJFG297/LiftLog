import { Chip } from '@/components/presentation/foundation/chip';
import { MsIconSrc } from '@/components/presentation/foundation/ms-icon-source';
import { RoundIconButton } from '@/components/presentation/foundation/round-icon-button';
import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { MIN_TOUCH_TARGET } from '@/components/presentation/foundation/touch-target';
import { RoutineCardSectionLabel } from '@/components/presentation/workout-editor/routine-exercise-card';
import { spacing, useAppTheme } from '@/hooks/useAppTheme';
import { Rest } from '@/models/blueprint-models';
import { withMinRest } from '@/models/rest-default';
import { formatTimeSpan } from '@/utils/format-time-span';
import { Duration } from '@js-joda/core';
import { useTranslate } from '@tolgee/react';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

/** The rest times offered as one tap each. Anything else is set under Advanced. */
export const ROUTINE_REST_PRESETS: readonly Duration[] = [60, 90, 120, 150, 180].map((s) => Duration.ofSeconds(s));

const REST_STEP = Duration.ofSeconds(15);
const LONGEST_REST = Duration.ofMinutes(30);

interface RoutineRestEditorProps {
  rest: Rest;
  onChange: (rest: Rest) => void;
}

/**
 * Rest between sets (plan decision D5): one rest time, the minimum, picked from presets, with the window's
 * maximum and the rest after a failed set under Advanced. All three still drive the timer.
 */
export function RoutineRestEditor({ rest, onChange }: RoutineRestEditorProps) {
  const { t } = useTranslate();
  const { tokens } = useAppTheme();
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const setMax = (maxRest: Duration) =>
    onChange({ ...rest, maxRest: maxRest.compareTo(rest.minRest) < 0 ? rest.minRest : maxRest });

  return (
    <View style={{ gap: spacing[2] }}>
      <RoutineCardSectionLabel>{t('routine_editor.rest.title')}</RoutineCardSectionLabel>
      <View style={{ flexDirection: 'row' }}>
        {ROUTINE_REST_PRESETS.map((preset) => (
          <Chip
            key={preset.seconds()}
            numeric
            label={formatTimeSpan(preset)}
            accessibilityLabel={t('routine_editor.rest.preset.label', { rest: formatTimeSpan(preset) })}
            selected={rest.minRest.equals(preset)}
            onPress={() => onChange(withMinRest(rest, preset))}
            style={{ flexGrow: 1, flexBasis: 0 }}
            contentStyle={{ paddingHorizontal: 0 }}
          />
        ))}
      </View>
      <Pressable
        onPress={() => setAdvancedOpen((open) => !open)}
        accessibilityRole="button"
        accessibilityState={{ expanded: advancedOpen }}
        style={{ minHeight: MIN_TOUCH_TARGET, flexDirection: 'row', alignItems: 'center', gap: spacing[1] }}
      >
        <SurfaceText font="text-sm" weight="600" style={{ color: tokens.accentInk }}>
          {t('routine_editor.rest.advanced.button')}
        </SurfaceText>
        <View style={{ transform: [{ rotate: advancedOpen ? '180deg' : '0deg' }] }}>
          <MsIconSrc name="expandMore" size={18} color={tokens.accentInk} />
        </View>
      </Pressable>
      {advancedOpen ? (
        <View style={{ gap: spacing[1] }}>
          <SurfaceText font="text-sm" style={{ color: tokens.muted }}>
            {t('routine_editor.rest.advanced.body')}
          </SurfaceText>
          <RestStepper
            label={t('routine_editor.rest.min.label')}
            value={rest.minRest}
            onChange={(minRest) => onChange(withMinRest(rest, minRest))}
          />
          <RestStepper label={t('routine_editor.rest.max.label')} value={rest.maxRest} onChange={setMax} />
          <RestStepper
            label={t('routine_editor.rest.failure.label')}
            value={rest.failureRest}
            onChange={(failureRest) => onChange({ ...rest, failureRest })}
          />
        </View>
      ) : null}
    </View>
  );
}

function RestStepper(props: { label: string; value: Duration; onChange: (value: Duration) => void }) {
  const { t } = useTranslate();
  const { tokens } = useAppTheme();
  const step = (direction: 1 | -1) => {
    const next = props.value.plus(REST_STEP.multipliedBy(direction));
    props.onChange(next.isNegative() ? Duration.ZERO : next.compareTo(LONGEST_REST) > 0 ? LONGEST_REST : next);
  };
  const time = formatTimeSpan(props.value);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
      <SurfaceText font="text-sm" style={{ flex: 1, color: tokens.ink }}>
        {props.label}
      </SurfaceText>
      <RoundIconButton
        icon="remove"
        size="compact"
        accessibilityLabel={t('routine_editor.rest.less.button', { label: props.label, rest: time })}
        disabled={props.value.isZero()}
        onPress={() => step(-1)}
      />
      <SurfaceText
        numeric
        font="text-base"
        weight="600"
        style={{ minWidth: 48, textAlign: 'center', color: tokens.ink }}
      >
        {time}
      </SurfaceText>
      <RoundIconButton
        icon="add"
        size="compact"
        accessibilityLabel={t('routine_editor.rest.more.button', { label: props.label, rest: time })}
        disabled={props.value.compareTo(LONGEST_REST) >= 0}
        onPress={() => step(1)}
      />
    </View>
  );
}
