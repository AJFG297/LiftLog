import { spacing, numberStyle } from '@/hooks/useAppTheme';
import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import {
  getDurationComponents,
  updateDurationHours,
  updateDurationMinutes,
  updateDurationSeconds,
} from '@/utils/duration-utils';
import { Duration } from '@js-joda/core';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { TextInput } from 'react-native-paper';

interface DurationEditorProps {
  label?: string;
  duration: Duration;
  showHours?: boolean;
  onDurationUpdated: (rest: Duration) => void;
  readonly?: boolean;
}

export default function DurationEditor(props: DurationEditorProps) {
  const { duration, onDurationUpdated, readonly } = props;

  const initial = getDurationComponents(duration);
  const [hours, setHours] = useState(initial.hours.toString());
  const [minutes, setMinutes] = useState(initial.minutes.toString());
  const [seconds, setSeconds] = useState(initial.seconds.toString());

  const updateHours = (text: string) => {
    setHours(text);
    const value = Number.parseInt(text);
    if (!isNaN(value)) {
      onDurationUpdated(updateDurationHours(duration, value));
    }
  };
  const updateMinutes = (text: string) => {
    setMinutes(text);
    const value = Number.parseInt(text);
    if (!isNaN(value)) {
      onDurationUpdated(updateDurationMinutes(duration, value));
    }
  };
  const updateSeconds = (text: string) => {
    setSeconds(text);
    const value = Number.parseInt(text);
    if (!isNaN(value)) {
      onDurationUpdated(updateDurationSeconds(duration, value));
    }
  };

  const resetValues = useCallback(() => {
    const components = getDurationComponents(duration);
    setHours(components.hours.toString());
    setMinutes(components.minutes.toString());
    setSeconds(components.seconds.toString());
  }, [duration]);
  useEffect(() => {
    resetValues();
  }, [readonly, resetValues]);

  return (
    <>
      {props.label && (
        <SurfaceText font="text-lg" style={{ textAlign: 'center' }}>
          {props.label}
        </SurfaceText>
      )}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'center',
          gap: spacing[2],
        }}
      >
        {props.showHours ? (
          <>
            <DurationField
              testID="duration-editor-hours"
              unit="h"
              value={hours}
              readOnly={readonly}
              onChangeText={updateHours}
              onBlur={resetValues}
            />
            <Separator />
          </>
        ) : undefined}
        <DurationField
          testID="duration-editor-minutes"
          unit="m"
          value={minutes}
          readOnly={readonly}
          onChangeText={updateMinutes}
          onBlur={resetValues}
        />
        <Separator />
        <DurationField
          testID="duration-editor-seconds"
          unit="s"
          value={seconds}
          readOnly={readonly}
          onChangeText={updateSeconds}
          onBlur={resetValues}
        />
      </View>
    </>
  );
}

function DurationField(props: {
  testID: string;
  unit: string;
  value: string;
  readOnly: boolean | undefined;
  onChangeText: (text: string) => void;
  onBlur: () => void;
}) {
  return (
    <TextInput
      mode="outlined"
      testID={props.testID}
      inputMode="numeric"
      readOnly={props.readOnly}
      submitBehavior="blurAndSubmit"
      returnKeyType="done"
      style={{ width: spacing[24], textAlign: 'center' }}
      contentStyle={numberStyle}
      value={props.value}
      onChangeText={props.onChangeText}
      onBlur={props.onBlur}
      right={<TextInput.Affix text={props.unit} />}
    />
  );
}

function Separator() {
  return (
    <SurfaceText font="text-xl" weight="bold" color="onSecondaryContainer" style={{ alignSelf: 'center' }}>
      :
    </SurfaceText>
  );
}
