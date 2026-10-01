import { MsIconSrc } from '@/components/presentation/foundation/ms-icon-source';
import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { spacing, useAppTheme } from '@/hooks/useAppTheme';
import { useTranslate } from '@tolgee/react';
import { Pressable, View } from 'react-native';

/**
 * Whether the routine editor shows "Ask AI to change this routine". The bar does nothing yet, so it stays
 * hidden until the AI routine builder (PM-33) gives it something to do.
 */
export const ASK_AI_BAR_ENABLED = false;

/** The "Ask AI to change this routine" bar at the foot of the routine editor. */
export function AskAiBar({ onPress }: { onPress: () => void }) {
  const { t } = useTranslate();
  const { tokens } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => ({
        minHeight: 52,
        borderRadius: 26,
        borderWidth: 1,
        borderColor: tokens.line,
        backgroundColor: pressed ? tokens.track : tokens.card,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing[2],
        paddingLeft: spacing[4],
        paddingRight: spacing[2],
      })}
    >
      <MsIconSrc name="promptSuggestion" size={20} color={tokens.accentInk} />
      <View style={{ flex: 1 }}>
        <SurfaceText font="text-sm" weight="600" style={{ color: tokens.ink }}>
          {t('routine_editor.ask_ai.title')}
        </SurfaceText>
        <SurfaceText font="text-xs" numberOfLines={1} style={{ color: tokens.muted }}>
          {t('routine_editor.ask_ai.body')}
        </SurfaceText>
      </View>
      <View
        style={{
          width: 38,
          height: 38,
          borderRadius: 19,
          backgroundColor: tokens.ink,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <MsIconSrc name="arrowUpward" size={16} color={tokens.bg} />
      </View>
    </Pressable>
  );
}
