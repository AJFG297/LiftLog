import { Chip } from '@/components/presentation/foundation/chip';
import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { spacing } from '@/hooks/useAppTheme';
import { useAppSelector } from '@/store';
import { selectMuscles } from '@/store/stored-sessions';
import { T, useTranslate } from '@tolgee/react';
import { translateExerciseMeta } from '@/utils/exercise-meta';
import { View } from 'react-native';

export default function ExerciseMuscleSelector(props: { muscles: string[]; onChange: (muscles: string[]) => void }) {
  const { muscles, onChange } = props;
  const { t } = useTranslate();
  const muscleList = useAppSelector(selectMuscles);
  return (
    <View style={{ gap: spacing[2] }}>
      <SurfaceText font="text-sm" weight="500">
        <T keyName="muscles.muscle.label" />
      </SurfaceText>
      <View
        style={{
          flexDirection: 'row',
          gap: spacing[1],
          flexWrap: 'wrap',
        }}
      >
        {muscleList.map((x) => (
          <Chip
            key={x}
            label={translateExerciseMeta(t, 'muscle', x)}
            onPress={() => {
              onChange(muscles.includes(x) ? muscles.filter((musc) => musc !== x) : muscles.concat([x]));
            }}
            selected={muscles.includes(x)}
            testID={`exercise-muscle-chip`}
          />
        ))}
      </View>
    </View>
  );
}
