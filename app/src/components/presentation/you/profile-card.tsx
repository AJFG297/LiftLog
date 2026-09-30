import { Card } from '@/components/presentation/foundation/card';
import { MsIconSrc } from '@/components/presentation/foundation/ms-icon-source';
import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { spacing, useAppTheme } from '@/hooks/useAppTheme';
import { View } from 'react-native';

const AVATAR_SIZE = 52;

interface ProfileCardProps {
  name: string;
  /** "42 workouts since March 2025". */
  subtitle: string;
  /** The first letter of a name the user set; without one the avatar shows a person. */
  initial: string | undefined;
  /** Opens the profile editor. Without it the card isn't a button. */
  onPress?: () => void;
}

/** The top of the You tab: who this is and how long they've been training. */
export function ProfileCard({ name, subtitle, initial, onPress }: ProfileCardProps) {
  const { tokens } = useAppTheme();
  const body = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[4] }}>
      <View
        style={{
          width: AVATAR_SIZE,
          height: AVATAR_SIZE,
          borderRadius: AVATAR_SIZE / 2,
          backgroundColor: tokens.accentSoft,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {initial ? (
          <SurfaceText font="text-xl" weight="700" style={{ color: tokens.accentSoftInk }}>
            {initial}
          </SurfaceText>
        ) : (
          <MsIconSrc name="person" size={28} color={tokens.accentSoftInk} />
        )}
      </View>
      <View style={{ flex: 1, gap: spacing[0.5] }}>
        <SurfaceText font="text-xl" weight="700" numberOfLines={1} style={{ color: tokens.ink }}>
          {name}
        </SurfaceText>
        <SurfaceText font="text-sm" style={{ color: tokens.muted }}>
          {subtitle}
        </SurfaceText>
      </View>
      {onPress ? <MsIconSrc name="chevronRight" size={20} color={tokens.muted} /> : null}
    </View>
  );
  return onPress ? (
    <Card testID="you-profile" onPress={onPress}>
      {body}
    </Card>
  ) : (
    <Card testID="you-profile">{body}</Card>
  );
}
