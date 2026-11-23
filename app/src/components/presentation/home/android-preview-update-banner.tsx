import { MsIconSrc } from '@/components/presentation/foundation/ms-icon-source';
import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { MIN_TOUCH_TARGET } from '@/components/presentation/foundation/touch-target';
import { spacing, useAppTheme } from '@/hooks/useAppTheme';
import { Pressable, View } from 'react-native';

const BANNER_RADIUS = 20;
const ICON_WELL_SIZE = 36;
const DOWNLOAD_BUTTON_HEIGHT = 46;
const DOWNLOAD_BUTTON_RADIUS = 14;

export interface AndroidPreviewUpdateBannerViewProps {
  title: string;
  body: string;
  downloadLabel: string;
  dismissLabel: string;
  onDownload: () => void;
  onDismiss: () => void;
}

/**
 * Dismissible Home banner prompting older Android preview APKs to download and install
 * a newer signed APK over the existing app.
 */
export function AndroidPreviewUpdateBannerView({
  title,
  body,
  downloadLabel,
  dismissLabel,
  onDownload,
  onDismiss,
}: AndroidPreviewUpdateBannerViewProps) {
  const { tokens } = useAppTheme();

  return (
    <View
      testID="android-preview-update-banner"
      style={{
        borderRadius: BANNER_RADIUS,
        backgroundColor: tokens.wash,
        borderWidth: 1,
        borderColor: tokens.accentLine,
        padding: spacing[4],
        gap: spacing[3],
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing[3] }}>
        <View
          style={{
            width: ICON_WELL_SIZE,
            height: ICON_WELL_SIZE,
            borderRadius: 12,
            backgroundColor: tokens.accentSoft,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <MsIconSrc name="download" size={20} color={tokens.accentSoftInk} />
        </View>
        <View style={{ flex: 1, gap: spacing[1] }}>
          <SurfaceText font="text-base" weight="700" style={{ color: tokens.ink }}>
            {title}
          </SurfaceText>
          <SurfaceText font="text-sm" style={{ color: tokens.muted }}>
            {body}
          </SurfaceText>
        </View>
        <Pressable
          testID="android-preview-update-dismiss"
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel={dismissLabel}
          style={{
            minWidth: MIN_TOUCH_TARGET,
            minHeight: MIN_TOUCH_TARGET,
            marginTop: -spacing[2],
            marginRight: -spacing[2],
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {({ pressed }) => (
            <View
              collapsable={false}
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: pressed ? tokens.track : 'transparent',
              }}
            >
              <MsIconSrc name="close" size={18} color={tokens.muted} />
            </View>
          )}
        </Pressable>
      </View>

      <Pressable
        testID="android-preview-update-download"
        onPress={onDownload}
        accessibilityRole="button"
        accessibilityLabel={downloadLabel}
      >
        {({ pressed }) => (
          <View
            collapsable={false}
            style={{
              minHeight: DOWNLOAD_BUTTON_HEIGHT,
              borderRadius: DOWNLOAD_BUTTON_RADIUS,
              paddingHorizontal: spacing[4],
              backgroundColor: tokens.accent,
              opacity: pressed ? 0.85 : 1,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: spacing[2],
            }}
          >
            <MsIconSrc name="download" size={18} color={tokens.onAccent} />
            <SurfaceText font="text-sm" weight="600" style={{ color: tokens.onAccent }}>
              {downloadLabel}
            </SurfaceText>
          </View>
        )}
      </Pressable>
    </View>
  );
}
