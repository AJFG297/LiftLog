import { Card } from '@/components/presentation/foundation/card';
import { Chip } from '@/components/presentation/foundation/chip';
import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { MIN_TOUCH_TARGET } from '@/components/presentation/foundation/touch-target';
import type { ChipOption } from '@/components/presentation/workout-editor/exercise-picker-filters';
import type { EquipmentChoice } from '@/components/presentation/workout-editor/exercise-picker';
import { fontFamily, spacing, useAppTheme } from '@/hooks/useAppTheme';
import { TextInput, View } from 'react-native';

function FieldLabel({ children }: { children: string }) {
  const { tokens } = useAppTheme();
  return (
    <SurfaceText
      font="text-xs"
      weight="600"
      style={{ color: tokens.muted, textTransform: 'uppercase', letterSpacing: 0.7 }}
    >
      {children}
    </SurfaceText>
  );
}

interface EquipmentChipsProps {
  label: string;
  /** "None", for an exercise that uses no equipment worth naming. */
  noneLabel: string;
  options: ChipOption<EquipmentChoice>[];
  value: EquipmentChoice | undefined;
  onChange: (value: EquipmentChoice | undefined) => void;
}

/** One piece of equipment, or none. Also the equipment field in Settings → Exercises. */
export function ExerciseEquipmentChips({ label, noneLabel, options, value, onChange }: EquipmentChipsProps) {
  return (
    <View style={{ gap: spacing[1] }}>
      <FieldLabel>{label}</FieldLabel>
      <View
        accessibilityLabel={label}
        style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -spacing[1] }}
      >
        <Chip
          testID="exercise-equipment-none"
          label={noneLabel}
          selected={value === undefined}
          onPress={() => onChange(undefined)}
        />
        {options.map((option) => (
          <Chip
            key={option.value}
            testID={`exercise-equipment-${option.value}`}
            label={option.label}
            selected={option.value === value}
            onPress={() => onChange(option.value)}
          />
        ))}
      </View>
    </View>
  );
}

interface ExerciseCreateFormProps {
  name: string;
  onNameChange: (name: string) => void;
  nameLabel: string;
  namePlaceholder: string;
  musclesLabel: string;
  musclesHint: string;
  muscleOptions: ChipOption<string>[];
  /** In the order they were tapped: the first is the main muscle, which the picker's chips file it under. */
  muscles: string[];
  onMusclesChange: (muscles: string[]) => void;
  equipment: EquipmentChipsProps;
}

/** The picker's New exercise form: a name, its muscles and its equipment. */
export function ExerciseCreateForm({
  name,
  onNameChange,
  nameLabel,
  namePlaceholder,
  musclesLabel,
  musclesHint,
  muscleOptions,
  muscles,
  onMusclesChange,
  equipment,
}: ExerciseCreateFormProps) {
  const { tokens } = useAppTheme();
  return (
    <View style={{ gap: spacing[3] }}>
      <Card style={{ gap: spacing[2] }}>
        <FieldLabel>{nameLabel}</FieldLabel>
        <TextInput
          testID="exercise-create-name"
          value={name}
          onChangeText={onNameChange}
          placeholder={namePlaceholder}
          placeholderTextColor={tokens.placeholder}
          accessibilityLabel={nameLabel}
          autoCapitalize="words"
          autoCorrect={false}
          autoFocus={!name}
          style={{
            fontFamily: fontFamily.text,
            fontSize: 22,
            fontWeight: '700',
            color: tokens.ink,
            padding: 0,
            minHeight: MIN_TOUCH_TARGET,
          }}
        />
      </Card>
      <Card style={{ gap: spacing[3] }}>
        <View style={{ gap: spacing[1] }}>
          <FieldLabel>{musclesLabel}</FieldLabel>
          <SurfaceText font="text-sm" style={{ color: tokens.muted }}>
            {musclesHint}
          </SurfaceText>
          <View
            accessibilityLabel={musclesLabel}
            style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -spacing[1] }}
          >
            {muscleOptions.map((option) => (
              <Chip
                key={option.value}
                testID={`exercise-create-muscle-${option.value}`}
                label={option.label}
                selected={muscles.includes(option.value)}
                onPress={() =>
                  onMusclesChange(
                    muscles.includes(option.value)
                      ? muscles.filter((muscle) => muscle !== option.value)
                      : [...muscles, option.value],
                  )
                }
              />
            ))}
          </View>
        </View>
        <ExerciseEquipmentChips {...equipment} />
      </Card>
    </View>
  );
}
