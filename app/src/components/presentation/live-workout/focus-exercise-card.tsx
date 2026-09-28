import { Card } from '@/components/presentation/foundation/card';
import { AppIconName, MsIconSrc } from '@/components/presentation/foundation/ms-icon-source';
import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { MIN_TOUCH_TARGET } from '@/components/presentation/foundation/touch-target';
import { spacing, useAppTheme } from '@/hooks/useAppTheme';
import { ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

const SHORTCUT_HEIGHT = 36;

export interface ExerciseShortcut {
  key: string;
  label: string;
  icon: AppIconName;
  onPress: () => void;
}

interface FocusExerciseCardProps {
  name: string;
  /** "Barbell · Rest 2:30". */
  meta: string;
  /** A superset page holds several cards, so their titles step down a size. */
  compact: boolean;
  shortcuts: ExerciseShortcut[];
  /** The exercise's menu (edit, stats, remove), beside the title. */
  menu?: ReactNode;
  target?: { title: string; body: string };
  /** The exercise's sets. */
  children: ReactNode;
  testID?: string;
}

/** One exercise on the live workout's focus page. */
export function FocusExerciseCard(props: FocusExerciseCardProps) {
  const { tokens } = useAppTheme();
  return (
    <Card testID={props.testID} style={{ gap: spacing[3], paddingHorizontal: spacing[3] }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing[2] }}>
        <View style={{ flex: 1, gap: spacing[0.5], paddingHorizontal: spacing[1] }}>
          <SurfaceText
            font={props.compact ? 'text-xl' : 'text-2xl'}
            weight="700"
            accessibilityRole="header"
            testID="weighted-exercise-title"
            style={{ color: tokens.ink, letterSpacing: -0.4 }}
          >
            {props.name}
          </SurfaceText>
          {props.meta ? (
            <SurfaceText font="text-sm" style={{ color: tokens.muted }}>
              {props.meta}
            </SurfaceText>
          ) : null}
        </View>
        {props.menu}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing[2] }}>
        {props.shortcuts.map((shortcut) => (
          <ShortcutChip key={shortcut.key} shortcut={shortcut} />
        ))}
      </ScrollView>

      {props.target ? (
        <View
          style={{
            flexDirection: 'row',
            gap: spacing[2],
            alignItems: 'flex-start',
            paddingVertical: spacing[2],
            paddingHorizontal: spacing[3],
            borderRadius: 12,
            backgroundColor: tokens.accentSoft,
          }}
        >
          <MsIconSrc name="trackChanges" size={18} color={tokens.accentSoftInk} />
          <View style={{ flex: 1, gap: spacing[0.5] }}>
            <SurfaceText font="text-sm" weight="700" style={{ color: tokens.accentSoftInk }}>
              {props.target.title}
            </SurfaceText>
            <SurfaceText font="text-sm" style={{ color: tokens.accentSoftInk }}>
              {props.target.body}
            </SurfaceText>
          </View>
        </View>
      ) : null}

      {props.children}
    </Card>
  );
}

/** An action, not a toggle: a 36pt pill in a 44pt target, like `Chip`, but read out as a button. */
function ShortcutChip({ shortcut }: { shortcut: ExerciseShortcut }) {
  const { tokens } = useAppTheme();
  return (
    <Pressable
      testID={`shortcut-${shortcut.key}`}
      onPress={shortcut.onPress}
      accessibilityRole="button"
      accessibilityLabel={shortcut.label}
      style={{ minHeight: MIN_TOUCH_TARGET, justifyContent: 'center' }}
    >
      {({ pressed }) => (
        <View
          style={{
            minHeight: SHORTCUT_HEIGHT,
            paddingHorizontal: spacing[3],
            borderRadius: SHORTCUT_HEIGHT / 2,
            borderWidth: 1,
            borderColor: tokens.line,
            backgroundColor: pressed ? tokens.track : tokens.bg,
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing[2],
          }}
        >
          <MsIconSrc name={shortcut.icon} size={16} color={tokens.ink} />
          <SurfaceText font="text-sm" weight="600" style={{ color: tokens.ink }}>
            {shortcut.label}
          </SurfaceText>
        </View>
      )}
    </Pressable>
  );
}
