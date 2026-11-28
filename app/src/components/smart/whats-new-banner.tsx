import Button from '@/components/presentation/foundation/button';
import IconButton from '@/components/presentation/foundation/icon-button';
import { Pager } from '@/components/presentation/foundation/pager';
import { spacing, useAppTheme } from '@/hooks/useAppTheme';
import { latestWhatsNewId, WhatsNewEntry } from '@/models/whats-new';
import { useAppSelector } from '@/store';
import { selectUnseenWhatsNew, setLastSeenWhatsNewId } from '@/store/settings';
import { T, useTranslate } from '@tolgee/react';
import { Href, useRouter } from 'expo-router';
import { routinesHref } from '@/components/smart/routines-href';
import { useGoToRoutines } from '@/hooks/useGoToRoutines';
import { StyleSheet, View } from 'react-native';
import Icon from '@/components/presentation/foundation/icon';
import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { shallowEqual, useDispatch } from 'react-redux';

export function WhatsNewBanner() {
  const unseen = useAppSelector(selectUnseenWhatsNew, shallowEqual);
  const dispatch = useDispatch();
  const { t } = useTranslate();
  const { tokens } = useAppTheme();
  const { push } = useRouter();
  const goToRoutines = useGoToRoutines();

  if (!unseen.length) {
    return null;
  }

  const dismiss = () => dispatch(setLastSeenWhatsNewId(latestWhatsNewId));

  const goToFeature = (route: Href) => {
    if (route === routinesHref()) {
      goToRoutines();
    } else {
      push(route);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: tokens.accentSoft }]}>
      <View style={styles.header}>
        <SurfaceText font="text-2xs" weight="600" style={{ color: tokens.accentSoftInk, letterSpacing: 1 }}>
          <T keyName="whats_new.eyebrow" />
        </SurfaceText>
        <IconButton
          icon="close"
          size={18}
          accessibilityLabel={t('generic.close.button')}
          onPress={dismiss}
          iconColor={tokens.accentSoftInk}
        />
      </View>

      <Pager indicatorColor={tokens.accentSoftInk}>
        {unseen.map((entry) => (
          <Feature key={entry.id} entry={entry} onPress={goToFeature} />
        ))}
      </Pager>
    </View>
  );
}

function Feature({ entry, onPress }: { entry: WhatsNewEntry; onPress: (route: Href) => void }) {
  const { tokens } = useAppTheme();
  return (
    <>
      <View style={styles.featureRow}>
        <View style={[styles.iconWell, { backgroundColor: tokens.accent }]}>
          <Icon source={entry.icon} size={22} color={tokens.onAccent} />
        </View>
        <SurfaceText font="text-base" weight="600" style={{ color: tokens.accentSoftInk, flexShrink: 1 }}>
          <T keyName={entry.titleKey} />
        </SurfaceText>
      </View>
      <SurfaceText font="text-xs" style={{ color: tokens.accentSoftInk, marginTop: spacing[2] }}>
        <T keyName={entry.bodyKey} />
      </SurfaceText>
      {entry.cta && (
        <View style={styles.ctaRow}>
          <Button mode="text" textColor={tokens.accentSoftInk} onPress={() => onPress(entry.cta!.route)}>
            <T keyName={entry.cta.labelKey} />
          </Button>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 20,
    padding: spacing[4],
    gap: spacing[1],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  iconWell: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: spacing[2],
  },
});
