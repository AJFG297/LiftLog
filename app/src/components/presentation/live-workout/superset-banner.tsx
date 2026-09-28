import { MsIconSrc } from '@/components/presentation/foundation/ms-icon-source';
import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { spacing, useAppTheme } from '@/hooks/useAppTheme';
import { useTranslate } from '@tolgee/react';
import { View } from 'react-native';

/** Heads a superset page: its exercises share the page and alternate set by set. */
export function SupersetBanner() {
  const { tokens } = useAppTheme();
  const { t } = useTranslate();
  return (
    <View
      testID="superset-banner"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing[2],
        paddingVertical: spacing[2],
        paddingHorizontal: spacing[3],
        borderRadius: 12,
        backgroundColor: tokens.inverse,
      }}
    >
      <MsIconSrc name="swapHoriz" size={18} color={tokens.invAccent} />
      <SurfaceText font="text-sm" style={{ flex: 1, color: tokens.inverseInk }}>
        <SurfaceText font="text-sm" weight="700" style={{ color: tokens.inverseInk }}>
          {t('live_workout.superset_banner.title')}
        </SurfaceText>{' '}
        {t('live_workout.superset_banner.body')}
      </SurfaceText>
    </View>
  );
}
