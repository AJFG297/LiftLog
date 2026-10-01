import { MsIconSrc } from '@/components/presentation/foundation/ms-icon-source';
import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { spacing, useAppTheme } from '@/hooks/useAppTheme';
import { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

const CARD_RADIUS = 18;
const BADGE_SIZE = 32;

interface RoutineExerciseCardProps {
  name: string;
  /** "3", or "A2" for a superset member. */
  label: string;
  inSuperset: boolean;
  summary: string;
  /** A short tag for the progression, such as "+2.5 kg". Nothing when it is off. */
  progressionTag: string | undefined;
  expanded: boolean;
  onToggle: () => void;
  /** Shown under the header while expanded. */
  children?: ReactNode;
  testID?: string;
}

/** One exercise in the routine editor: a summary line that opens into the exercise's settings. */
export function RoutineExerciseCard(props: RoutineExerciseCardProps) {
  const { tokens } = useAppTheme();
  return (
    <View
      testID={props.testID}
      style={{
        backgroundColor: tokens.card,
        borderRadius: CARD_RADIUS,
        borderWidth: props.expanded ? 1.5 : 1,
        borderColor: props.expanded ? tokens.accentInk : tokens.line,
      }}
    >
      <Pressable
        onPress={props.onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: props.expanded }}
        accessibilityLabel={`${props.label}, ${props.name}. ${props.summary}${props.progressionTag ? `. ${props.progressionTag}` : ''}`}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing[3],
          minHeight: 64,
          paddingVertical: spacing[3],
          paddingHorizontal: spacing[3],
          borderRadius: CARD_RADIUS,
          backgroundColor: pressed ? tokens.track : undefined,
        })}
      >
        <View
          style={{
            width: BADGE_SIZE,
            height: BADGE_SIZE,
            borderRadius: BADGE_SIZE / 2,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: props.inSuperset ? tokens.accentSoft : tokens.bg,
          }}
        >
          <SurfaceText
            font="text-xs"
            weight="700"
            numeric={!props.inSuperset}
            maxFontSizeMultiplier={1.5}
            style={{ color: props.inSuperset ? tokens.accentSoftInk : tokens.ink }}
          >
            {props.label}
          </SurfaceText>
        </View>
        <View style={{ flex: 1, gap: spacing[0.5] }}>
          <SurfaceText font="text-base" weight="600" style={{ color: tokens.ink }}>
            {props.name}
          </SurfaceText>
          <SurfaceText font="text-sm" numberOfLines={1} style={{ color: tokens.muted }}>
            {props.summary}
          </SurfaceText>
        </View>
        {props.progressionTag ? (
          <View
            style={{
              backgroundColor: tokens.accentSoft,
              borderRadius: 7,
              paddingHorizontal: spacing[2],
              paddingVertical: spacing[0.5],
            }}
          >
            <SurfaceText font="text-xs" weight="700" numberOfLines={1} style={{ color: tokens.accentSoftInk }}>
              {props.progressionTag}
            </SurfaceText>
          </View>
        ) : null}
        <View style={{ transform: [{ rotate: props.expanded ? '180deg' : '0deg' }] }}>
          <MsIconSrc name="expandMore" size={20} color={tokens.muted} />
        </View>
      </Pressable>
      {props.expanded && props.children ? (
        <View style={{ gap: spacing[4], paddingHorizontal: spacing[3], paddingBottom: spacing[3] }}>
          {props.children}
        </View>
      ) : null}
    </View>
  );
}

/** "Superset A", with Unlink, above the exercises it joins. */
export function RoutineSupersetHeader(props: { title: string; unlinkLabel: string; onUnlink: () => void }) {
  const { tokens } = useAppTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: spacing[1],
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[1] }}>
        <MsIconSrc name="link" size={16} color={tokens.muted} />
        <SurfaceText
          font="text-xs"
          weight="700"
          accessibilityRole="header"
          style={{ color: tokens.muted, textTransform: 'uppercase', letterSpacing: 0.7 }}
        >
          {props.title}
        </SurfaceText>
      </View>
      <Pressable
        onPress={props.onUnlink}
        accessibilityRole="button"
        accessibilityLabel={`${props.unlinkLabel}, ${props.title}`}
        style={{ minHeight: 44, minWidth: 44, justifyContent: 'center', paddingHorizontal: spacing[2] }}
      >
        <SurfaceText font="text-sm" weight="600" style={{ color: tokens.accentInk }}>
          {props.unlinkLabel}
        </SurfaceText>
      </Pressable>
    </View>
  );
}

/** A label over a section of an expanded exercise card: "Rest between sets", "Progression". */
export function RoutineCardSectionLabel({ children }: { children: string }) {
  const { tokens } = useAppTheme();
  return (
    <SurfaceText font="text-sm" weight="600" accessibilityRole="header" style={{ color: tokens.muted }}>
      {children}
    </SurfaceText>
  );
}
