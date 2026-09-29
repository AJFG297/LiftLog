import { RoundIconButton } from '@/components/presentation/foundation/round-icon-button';
import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { MIN_TOUCH_TARGET } from '@/components/presentation/foundation/touch-target';
import { spacing, useAppTheme } from '@/hooks/useAppTheme';
import { useTranslate } from '@tolgee/react';
import { View } from 'react-native';

interface SheetHeaderProps {
  title: string;
  /** Follows the title after a dot and never truncates: a long title gives way to it instead. */
  titleDetail?: string;
  subtitle?: string;
  /** Usually `router.back`: a sheet is a route. */
  onClose: () => void;
}

/** Header for a `formSheetOptions` sheet, which hides the native one. */
export function SheetHeader({ title, titleDetail, subtitle, onClose }: SheetHeaderProps) {
  const { tokens } = useAppTheme();
  const { t } = useTranslate();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2], paddingVertical: spacing[3] }}>
      <RoundIconButton icon="close" accessibilityLabel={t('generic.close.button')} onPress={onClose} />
      <View style={{ flex: 1, alignItems: 'center' }}>
        <View
          accessible
          accessibilityRole="header"
          accessibilityLabel={titleDetail ? `${title} · ${titleDetail}` : title}
          style={{ flexDirection: 'row', maxWidth: '100%' }}
        >
          <SurfaceText font="text-lg" weight="700" numberOfLines={1} style={{ flexShrink: 1, color: tokens.ink }}>
            {title}
          </SurfaceText>
          {titleDetail ? (
            <SurfaceText font="text-lg" weight="700" numberOfLines={1} style={{ flexShrink: 0, color: tokens.ink }}>
              {` · ${titleDetail}`}
            </SurfaceText>
          ) : null}
        </View>
        {subtitle ? (
          <SurfaceText font="text-sm" numberOfLines={1} style={{ color: tokens.muted }}>
            {subtitle}
          </SurfaceText>
        ) : null}
      </View>
      {/* Balances the close button so the title stays centred on the sheet. */}
      <View style={{ width: MIN_TOUCH_TARGET }} />
    </View>
  );
}
