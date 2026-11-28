import FullHeightScrollView from '@/components/layout/full-height-scroll-view';
import Button from '@/components/presentation/foundation/button';
import { spacing, useAppTheme } from '@/hooks/useAppTheme';
import { latestWhatsNewId, whatsNewEntries, WhatsNewEntry } from '@/models/whats-new';
import { useAppSelector } from '@/store';
import { selectHasUnseenWhatsNew, setLastSeenWhatsNewId } from '@/store/settings';
import { T, useTranslate } from '@tolgee/react';
import { Href, Stack, useRouter } from 'expo-router';
import { routinesHref } from '@/components/smart/routines-href';
import { useGoToRoutines } from '@/hooks/useGoToRoutines';
import { useEffect } from 'react';
import { View } from 'react-native';
import { Card } from '@/components/presentation/foundation/card';
import Icon from '@/components/presentation/foundation/icon';
import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { useDispatch } from 'react-redux';

export default function WhatsNew() {
  const { t } = useTranslate();
  const dispatch = useDispatch();
  const hasUnseen = useAppSelector(selectHasUnseenWhatsNew);

  useEffect(() => {
    if (hasUnseen) {
      dispatch(setLastSeenWhatsNewId(latestWhatsNewId));
    }
  }, [hasUnseen, dispatch]);

  const entries = [...whatsNewEntries].reverse();

  return (
    <FullHeightScrollView scrollStyle={{ paddingHorizontal: spacing.pageHorizontalMargin }}>
      <Stack.Screen options={{ title: t('whats_new.title') }} />
      <View style={{ gap: spacing[3], paddingTop: spacing[4] }}>
        {entries.map((entry) => (
          <WhatsNewCard key={entry.id} entry={entry} />
        ))}
      </View>
    </FullHeightScrollView>
  );
}

function WhatsNewCard({ entry }: { entry: WhatsNewEntry }) {
  const { tokens } = useAppTheme();
  const { push } = useRouter();
  const goToRoutines = useGoToRoutines();
  const goToFeature = (route: Href) => (route === routinesHref() ? goToRoutines() : push(route));

  return (
    <Card style={{ gap: spacing[2] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: tokens.accentSoft,
          }}
        >
          <Icon source={entry.icon} size={24} color={tokens.accentSoftInk} />
        </View>
        <SurfaceText font="text-base" weight="600" style={{ flexShrink: 1, color: tokens.ink }}>
          <T keyName={entry.titleKey} />
        </SurfaceText>
      </View>
      <SurfaceText font="text-sm" style={{ color: tokens.muted }}>
        <T keyName={entry.bodyKey} />
      </SurfaceText>
      {entry.cta && (
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
          <Button mode="text" onPress={() => goToFeature(entry.cta!.route)}>
            {entry.cta.labelKey && <T keyName={entry.cta.labelKey} />}
          </Button>
        </View>
      )}
    </Card>
  );
}
