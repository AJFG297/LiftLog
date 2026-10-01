import { type AppIconName, MsIconSrc } from '@/components/presentation/foundation/ms-icon-source';
import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { spacing, useAppTheme } from '@/hooks/useAppTheme';
import { useTranslate } from '@tolgee/react';
import { Pressable, View } from 'react-native';

interface RoutineStartOptionsProps {
  onPickExercises: () => void;
  onDescribe: () => void;
  onImport: () => void;
  onFromProgram: () => void;
}

/** A new routine's empty state: the four ways to start one. Picking exercises is the main one. */
export function RoutineStartOptions(props: RoutineStartOptionsProps) {
  const { t } = useTranslate();
  const { tokens } = useAppTheme();
  return (
    <View style={{ gap: spacing[2] }}>
      <SurfaceText
        font="text-lg"
        weight="700"
        accessibilityRole="header"
        style={{ color: tokens.ink, paddingHorizontal: spacing[1], paddingTop: spacing[1] }}
      >
        {t('routine_editor.start.title')}
      </SurfaceText>
      <StartOption
        primary
        icon="add"
        title={t('routine_editor.start.pick.title')}
        body={t('routine_editor.start.pick.body')}
        onPress={props.onPickExercises}
        testID="routine-start-pick"
      />
      <StartOption
        icon="promptSuggestion"
        accent
        title={t('routine_editor.start.describe.title')}
        body={t('routine_editor.start.describe.body')}
        onPress={props.onDescribe}
      />
      <StartOption
        icon="download"
        title={t('routine_editor.start.import.title')}
        body={t('routine_editor.start.import.body')}
        onPress={props.onImport}
      />
      <StartOption
        icon="assignment"
        title={t('routine_editor.start.program.title')}
        body={t('routine_editor.start.program.body')}
        onPress={props.onFromProgram}
      />
    </View>
  );
}

function StartOption(props: {
  icon: AppIconName;
  title: string;
  body: string;
  onPress: () => void;
  /** The inverse slab, for the one start most people want. */
  primary?: boolean;
  /** An accent-tinted icon, for the AI start. */
  accent?: boolean;
  testID?: string;
}) {
  const { tokens } = useAppTheme();
  const ink = props.primary ? tokens.inverseInk : tokens.ink;
  const iconColor = props.primary ? tokens.inverseInk : props.accent ? tokens.accentInk : tokens.ink;
  return (
    <Pressable
      testID={props.testID}
      onPress={props.onPress}
      accessibilityRole="button"
      accessibilityLabel={`${props.title}. ${props.body}`}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing[3],
        padding: spacing[4],
        borderRadius: 18,
        borderWidth: props.primary ? 0 : 1,
        borderColor: tokens.line,
        backgroundColor: props.primary ? tokens.inverse : pressed ? tokens.track : tokens.card,
        opacity: props.primary && pressed ? 0.85 : 1,
      })}
    >
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 14,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: props.primary ? tokens.inverseRaised : props.accent ? tokens.accentSoft : tokens.bg,
        }}
      >
        <MsIconSrc name={props.icon} size={22} color={iconColor} />
      </View>
      <View style={{ flex: 1, gap: spacing[0.5] }}>
        <SurfaceText font="text-base" weight="600" style={{ color: ink }}>
          {props.title}
        </SurfaceText>
        <SurfaceText font="text-sm" style={{ color: props.primary ? tokens.inverseMuted : tokens.muted }}>
          {props.body}
        </SurfaceText>
      </View>
    </Pressable>
  );
}
