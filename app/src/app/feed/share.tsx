import FullHeightScrollView from '@/components/layout/full-height-scroll-view';
import LimitedHtml from '@/components/presentation/foundation/limited-html';
import { Remote } from '@/components/presentation/foundation/remote';
import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { spacing, useAppTheme } from '@/hooks/useAppTheme';
import { PendingFeedUser } from '@/models/feed-models';
import { RemoteData } from '@/models/remote';
import { useAppSelector } from '@/store';
import { fetchAndSetSharedFeedUser, requestFollowUser, selectSharedFeedUser, setSharedFeedUser } from '@/store/feed';
import { useTranslate } from '@tolgee/react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect } from 'react';
import { View } from 'react-native';
import Button from '@/components/presentation/foundation/button';
import { Card } from '@/components/presentation/foundation/card';
import Icon from '@/components/presentation/foundation/icon';
import { useDispatch } from 'react-redux';

export default function FeedSharePage() {
  const { t } = useTranslate();
  const { id, name } = useLocalSearchParams<{
    id?: string;
    name?: string;
  }>();
  const dispatch = useDispatch();
  const { back } = useRouter();
  const { tokens } = useAppTheme();

  const fetchUser = useCallback(() => {
    if (!id) {
      dispatch(setSharedFeedUser(RemoteData.error('Failed to load user')));
      return;
    }
    dispatch(
      fetchAndSetSharedFeedUser({
        idOrLookup: id,
        name: name ?? '',
        fromUserAction: true,
      }),
    );
  }, [dispatch, id, name]);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const sharedProfileRemote = useAppSelector(selectSharedFeedUser);

  const handleAcceptRequest = (user: PendingFeedUser) => {
    dispatch(requestFollowUser({ user, fromUserAction: true }));
    back();
  };

  return (
    <FullHeightScrollView>
      <Stack.Screen options={{ title: t('feed.feed.title') }} />
      <Remote
        retry={fetchUser}
        value={sharedProfileRemote}
        success={(sharedProfile) => (
          <View style={{ padding: spacing.pageHorizontalMargin }}>
            <Card style={{ gap: spacing[4] }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
                <Icon source={'personFill'} size={28} />
                <SurfaceText font="text-2xl" weight="600" style={{ flexShrink: 1 }}>
                  {t('feed.profile_share_request.title')}
                </SurfaceText>
              </View>
              <SurfaceText style={{ textAlign: 'center' }}>
                <LimitedHtml
                  value={t('feed.user_wants_to_share_profile.message', {
                    user: sharedProfile.name || 'Anonymous user',
                  })}
                />
              </SurfaceText>

              <SurfaceText style={{ textAlign: 'center', color: tokens.muted }}>
                {t('feed.accept_to_follow.explanation')}
              </SurfaceText>

              <View style={{ flexDirection: 'row', justifyContent: 'center', gap: spacing[2] }}>
                <Button mode="outlined" onPress={() => back()}>
                  {t('generic.cancel.button')}
                </Button>
                <Button
                  testID="feed-share-accept-button"
                  mode="contained"
                  onPress={() => handleAcceptRequest(sharedProfile)}
                  icon="check"
                >
                  {t('generic.accept.button')}
                </Button>
              </View>
            </Card>
          </View>
        )}
      />
    </FullHeightScrollView>
  );
}
