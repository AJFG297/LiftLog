import { useAppTheme } from '@/hooks/useAppTheme';
import { useAppSelector } from '@/store';
import { selectFollowRequestCount } from '@/store/feed';
import { useTranslate } from '@tolgee/react';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { Platform } from 'react-native';

export default function TabsLayout() {
  const { t } = useTranslate();
  const { colors } = useAppTheme();
  const followRequestCount = useAppSelector(selectFollowRequestCount);
  const showFeed = useAppSelector((x) => x.settings.showFeed);
  // The feed lives under You, so its follow requests badge the You tab.
  const youBadge = showFeed && followRequestCount ? followRequestCount.toString() : undefined;
  return (
    <NativeTabs
      indicatorColor={colors.secondaryContainer}
      rippleColor={colors.onSecondaryContainer + '1A'}
      backgroundColor={colors.surfaceContainer}
      labelVisibilityMode="labeled"
      iconColor={colors.onSurfaceVariant}
      // The Android default label colours are platform colours, resolved once when the tab bar is set up,
      // so they keep the old theme after a live light/dark switch. Passing ours re-sends them on each change.
      labelStyle={
        Platform.OS === 'android'
          ? { default: { color: colors.onSurfaceVariant }, selected: { color: colors.onSurface } }
          : undefined
      }
    >
      <NativeTabs.Trigger name="(session)">
        <NativeTabs.Trigger.Label>{t('tabs.home.label')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'house', selected: 'house.fill' }}
          md={{ default: 'home', selected: 'home' }}
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="routines">
        <NativeTabs.Trigger.Label>{t('tabs.routines.label')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'list.clipboard', selected: 'list.clipboard.fill' }}
          md={{ default: 'assignment', selected: 'assignment' }}
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="stats">
        <NativeTabs.Trigger.Label>{t('tabs.progress.label')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'chart.bar', selected: 'chart.bar.fill' }}
          md={{ default: 'bar_chart', selected: 'bar_chart' }}
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings">
        <NativeTabs.Trigger.Label>{t('tabs.you.label')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'person', selected: 'person.fill' }}
          md={{ default: 'person', selected: 'person' }}
        />
        {youBadge && <NativeTabs.Trigger.Badge>{youBadge}</NativeTabs.Trigger.Badge>}
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
