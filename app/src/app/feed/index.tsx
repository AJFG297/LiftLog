import { SegmentedControl } from '@/components/presentation/foundation/segmented-control';
import Feed from '@/components/smart/feed';
import { FeedFollowers } from '@/components/smart/feed-followers';
import { FeedFollowing } from '@/components/smart/feed-following';
import { FeedMenu } from '@/components/smart/feed-menu';
import { spacing } from '@/hooks/useAppTheme';
import { ScrollProvider, useScroll, useScrollHeaderColor } from '@/hooks/useScrollListener';
import { useAppSelector } from '@/store';
import { selectFollowRequestCount } from '@/store/feed';
import { useTranslate } from '@tolgee/react';
import { Stack } from 'expo-router';
import { HeaderHeightContext } from 'expo-router/react-navigation';
import { useContext, useEffect, useState } from 'react';
import { Animated, Platform, View } from 'react-native';

type FeedTab = 'feed' | 'following' | 'followers';

export default function FeedIndexPage() {
  const { t } = useTranslate();
  const followRequestCount = useAppSelector(selectFollowRequestCount);

  const { setScrolled } = useScroll();
  const headerColor = useScrollHeaderColor();

  const [activeTab, setActiveTab] = useState<FeedTab>('feed');
  const [tabScrolls, setTabScrolls] = useState<Partial<Record<FeedTab, boolean>>>({});
  const setTabScrolled = (isScrolled: boolean, tab: FeedTab) => {
    if (tabScrolls[tab] !== isScrolled) {
      setTabScrolls((x) => ({ ...x, [tab]: isScrolled }));
    }
  };

  useEffect(() => {
    setScrolled(!!tabScrolls[activeTab]);
  }, [tabScrolls, activeTab, setScrolled]);

  const headerHeight = useContext(HeaderHeightContext); // Intentionally don't use useHeaderHeight as it might not be in a stack
  const topInsetHeight = Platform.select({ ios: headerHeight }) ?? 0;

  const followersLabel = followRequestCount
    ? `${t('feed.followers.title')} (${followRequestCount})`
    : t('feed.followers.title');

  return (
    <>
      <Stack.Screen options={{ title: t('feed.feed.title') }} />
      <FeedMenu />
      <Animated.View
        style={{
          backgroundColor: headerColor,
          paddingTop: topInsetHeight + spacing[2],
          paddingBottom: spacing[2],
          paddingHorizontal: spacing.pageHorizontalMargin,
        }}
      >
        <SegmentedControl
          testID="feed-tabs"
          accessibilityLabel={t('feed.feed.title')}
          value={activeTab}
          onChange={(next) => {
            // Only the selected tab is mounted, so the one being entered starts back at the top.
            setTabScrolls((x) => ({ ...x, [next]: false }));
            setActiveTab(next);
          }}
          options={[
            { value: 'feed', label: t('feed.feed.title') },
            { value: 'following', label: t('feed.following.title') },
            { value: 'followers', label: followersLabel },
          ]}
        />
      </Animated.View>
      <View style={{ flex: 1 }}>
        <ScrollProvider isScrolled={!!tabScrolls[activeTab]} setScrolled={(s) => setTabScrolled(s, activeTab)}>
          {activeTab === 'feed' ? <Feed /> : activeTab === 'following' ? <FeedFollowing /> : <FeedFollowers />}
        </ScrollProvider>
      </View>
    </>
  );
}
