import Button from '@/components/presentation/foundation/button';
import { Pager } from '@/components/presentation/foundation/pager';
import { SelectPickerOption } from '@/components/presentation/foundation/select-picker';
import { SegmentedGroup, SegmentListFormElement } from '@/components/presentation/foundation/segmented-list';
import { SegmentedListSwitch } from '@/components/presentation/foundation/segmented-list-switch';
import { SegmentedListSelect } from '@/components/presentation/foundation/segmented-list-select';
import Icon from '@/components/presentation/foundation/icon';
import ThemeChooser from '@/components/presentation/foundation/editors/theme-chooser';
import { spacing, useAppTheme } from '@/hooks/useAppTheme';
import { supportedLanguages } from '@/services/tolgee';
import { useAppSelector } from '@/store';
import {
  setColorSchemeSeed,
  setFirstDayOfWeek,
  setLastSeenWhatsNewId,
  setLogRpe,
  setPreferredLanguage,
  setRestNotifications,
  setShowFeed,
  setThemeMode,
  setTrueBlackDarkTheme,
  setUseImperialUnits,
  setWelcomeWizardCompleted,
} from '@/store/settings';
import { latestWhatsNewId } from '@/models/whats-new';
import { getDateOnDay } from '@/utils/format-date';
import { DayOfWeek } from '@js-joda/core';
import { useTranslate } from '@tolgee/react';
import { ReactNode, useMemo, useState } from 'react';
import { Modal, ScrollView, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useDispatch } from 'react-redux';
import { openUrl } from '@/utils/open-url';
import { useFormatDate } from '@/hooks/useFormatDate';
import { requestPermissionsAsync } from 'expo-notifications';
import { HealthExportSwitch, useCanExportHealth } from './health-export-switch';

function WizardPage({ children }: { children: ReactNode }) {
  return (
    <ScrollView style={styles.pageScroll} contentContainerStyle={styles.pageContent} nestedScrollEnabled>
      {children}
    </ScrollView>
  );
}

export function WelcomeWizard() {
  const notificationsEnabled = useAppSelector((x) => x.settings.restNotifications);
  const formatDate = useFormatDate();
  const daysOfWeekOptions: SelectPickerOption<DayOfWeek>[] = [
    {
      value: DayOfWeek.SUNDAY,
      label: formatDate(getDateOnDay(DayOfWeek.SUNDAY), { weekday: 'long' }),
    },
    {
      value: DayOfWeek.MONDAY,
      label: formatDate(getDateOnDay(DayOfWeek.MONDAY), { weekday: 'long' }),
    },
    {
      value: DayOfWeek.TUESDAY,
      label: formatDate(getDateOnDay(DayOfWeek.TUESDAY), { weekday: 'long' }),
    },
    {
      value: DayOfWeek.WEDNESDAY,
      label: formatDate(getDateOnDay(DayOfWeek.WEDNESDAY), { weekday: 'long' }),
    },
    {
      value: DayOfWeek.THURSDAY,
      label: formatDate(getDateOnDay(DayOfWeek.THURSDAY), { weekday: 'long' }),
    },
    {
      value: DayOfWeek.FRIDAY,
      label: formatDate(getDateOnDay(DayOfWeek.FRIDAY), { weekday: 'long' }),
    },
    {
      value: DayOfWeek.SATURDAY,
      label: formatDate(getDateOnDay(DayOfWeek.SATURDAY), { weekday: 'long' }),
    },
  ];

  const { t } = useTranslate();
  const dispatch = useDispatch();
  const settings = useAppSelector((state) => state.settings);
  const welcomeWizardCompleted = settings.welcomeWizardCompleted;
  const { tokens } = useAppTheme();
  const [currentPage, setCurrentPage] = useState(0);
  const canExportHealth = useCanExportHealth();

  const languageOptions: SelectPickerOption<string | undefined>[] = useMemo(
    () => [
      {
        value: undefined,
        label: t('settings.system_default.label'),
      },
      ...supportedLanguages.map((x) => ({ value: x.code, label: x.label })),
    ],
    [t],
  );

  const totalPages = 3;

  const handleNext = async () => {
    if (currentPage < totalPages - 1) {
      setCurrentPage(currentPage + 1);
    } else {
      dispatch(setWelcomeWizardCompleted(true));
      dispatch(setLastSeenWhatsNewId(latestWhatsNewId));
      if (notificationsEnabled) {
        await requestPermissionsAsync();
      }
    }
  };

  const handlePrevious = () => {
    if (currentPage > 0) {
      setCurrentPage(currentPage - 1);
    }
  };

  const renderCrashReportsPage = () => (
    <WizardPage>
      <View style={styles.headerSection}>
        <SurfaceText
          font="text-2xl"
          weight="600"
          accessibilityRole="header"
          style={[styles.pageTitle, { color: tokens.ink }]}
        >
          {t('onboarding.welcome.title')}
        </SurfaceText>
        <SurfaceText font="text-base" style={[styles.pageSubtitle, { color: tokens.muted }]}>
          {t('onboarding.welcome.subtitle')}
        </SurfaceText>
      </View>

      <View style={styles.settingsSection}>
        <SurfaceText font="text-base" weight="600" style={{ color: tokens.ink }}>
          {t('onboarding.open_source.title')}
        </SurfaceText>
        <SurfaceText font="text-sm" style={{ color: tokens.muted }}>
          {t('onboarding.open_source.body')}
        </SurfaceText>
        <SegmentedGroup>
          <SegmentListFormElement
            label={t('onboarding.open_source.button')}
            icon={'link'}
            onPress={() => openUrl('https://github.com/LiamMorrow/LiftLog')}
            right={<Icon source="openInBrowser" size={20} />}
          />
          <SegmentListFormElement
            label={t('onboarding.privacy_policy.button')}
            icon={'description'}
            onPress={() => openUrl('https://liftlog.online/privacy.html')}
            right={<Icon source="openInBrowser" size={20} />}
          />
        </SegmentedGroup>
      </View>
    </WizardPage>
  );

  const renderLocalizationPage = () => (
    <WizardPage>
      <View style={styles.headerSection}>
        <SurfaceText
          font="text-2xl"
          weight="600"
          accessibilityRole="header"
          style={[styles.pageTitle, { color: tokens.ink }]}
        >
          {t('settings.localisation.title')}
        </SurfaceText>
        <SurfaceText font="text-base" style={[styles.pageSubtitle, { color: tokens.muted }]}>
          {t('settings.localisation.subtitle')}
        </SurfaceText>
      </View>

      <View style={styles.settingsSection}>
        <SegmentedGroup>
          <SegmentedListSwitch
            label={t('settings.use_imperial_units.label')}
            icon={'weight'}
            supportingText={t('settings.use_imperial_units.subtitle')}
            value={settings.useImperialUnits}
            onValueChange={(value) => dispatch(setUseImperialUnits(value))}
          />
          <SegmentedListSelect
            label={t('settings.first_day_of_week.label')}
            icon={'calendar'}
            supportingText={t('settings.first_day_of_week.subtitle')}
            value={settings.firstDayOfWeek}
            options={daysOfWeekOptions}
            onChange={(value) => dispatch(setFirstDayOfWeek(value))}
          />
          <SegmentedListSelect
            label={t('settings.set_language.button')}
            icon={'language'}
            supportingText={t('settings.set_language.subtitle')}
            value={settings.preferredLanguage}
            options={languageOptions}
            onChange={(value) => dispatch(setPreferredLanguage(value))}
          />
        </SegmentedGroup>
        <ThemeChooser
          seed={settings.colorSchemeSeed}
          onUpdateTheme={(x) => dispatch(setColorSchemeSeed(x))}
          setTrueBlack={(b) => dispatch(setTrueBlackDarkTheme(b))}
          trueBlack={settings.trueBlackDarkTheme}
          themeMode={settings.themeMode}
          setThemeMode={(m) => dispatch(setThemeMode(m))}
        />
      </View>
    </WizardPage>
  );

  const renderNotificationsAndFeedPage = () => (
    <WizardPage>
      <View style={styles.headerSection}>
        <SurfaceText
          font="text-2xl"
          weight="600"
          accessibilityRole="header"
          style={[styles.pageTitle, { color: tokens.ink }]}
        >
          {t('onboarding.notifications_and_feed.title')}
        </SurfaceText>
        <SurfaceText font="text-base" style={[styles.pageSubtitle, { color: tokens.muted }]}>
          {t('onboarding.notifications_and_feed.subtitle')}
        </SurfaceText>
      </View>

      <View style={styles.settingsSection}>
        <SurfaceText font="text-base" weight="600" style={{ color: tokens.ink }}>
          {t('settings.notifications.title')}
        </SurfaceText>
        <SegmentedGroup>
          <SegmentedListSwitch
            label={t('rest.notifications.title')}
            icon={'notifications'}
            supportingText={t('rest.notifications.subtitle')}
            value={settings.restNotifications}
            onValueChange={(value) => dispatch(setRestNotifications(value))}
          />
        </SegmentedGroup>

        <SurfaceText font="text-base" weight="600" style={[styles.topSpacing, { color: tokens.ink }]}>
          {t('onboarding.workout.title')}
        </SurfaceText>
        <SegmentedGroup>
          <SegmentedListSwitch
            label={t('workout.log_rpe.label')}
            icon={'speed'}
            supportingText={t('workout.log_rpe.subtitle')}
            value={settings.logRpe}
            onValueChange={(value) => dispatch(setLogRpe(value))}
          />
        </SegmentedGroup>

        <SurfaceText font="text-base" weight="600" style={[styles.topSpacing, { color: tokens.ink }]}>
          {t('feed.feed.title')}
        </SurfaceText>
        <SegmentedGroup>
          <SegmentedListSwitch
            label={t('feed.show_feed.label')}
            icon={'forum'}
            supportingText={t('feed.show_feed.you.subtitle')}
            value={settings.showFeed}
            onValueChange={(value) => dispatch(setShowFeed(value))}
          />
          {canExportHealth ? <HealthExportSwitch /> : undefined}
        </SegmentedGroup>
      </View>
    </WizardPage>
  );

  return (
    !welcomeWizardCompleted && (
      // A modal of its own, so the first run covers the tab bar as well as Home.
      <Modal visible animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={() => {}}>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <SafeAreaView style={{ flex: 1, backgroundColor: tokens.bg }}>
            <View style={[styles.container]}>
              <Pager fill page={currentPage} onPageChange={setCurrentPage}>
                {renderCrashReportsPage()}
                {renderLocalizationPage()}
                {renderNotificationsAndFeedPage()}
              </Pager>

              <View style={styles.footer}>
                <View style={styles.buttonRow}>
                  <Button mode="text" onPress={handlePrevious} disabled={currentPage === 0} style={styles.button}>
                    {t('generic.previous.button')}
                  </Button>
                  <Button mode="contained" onPress={() => void handleNext()} style={styles.button}>
                    {currentPage === totalPages - 1 ? t('onboarding.get_started.button') : t('generic.next.button')}
                  </Button>
                </View>
              </View>
            </View>
          </SafeAreaView>
        </GestureHandlerRootView>
      </Modal>
    )
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  pageScroll: {
    flex: 1,
  },
  pageContent: {
    marginTop: spacing.pageHorizontalMargin,
    paddingBottom: spacing[4],
  },
  headerSection: {
    marginBottom: spacing[8],
    alignItems: 'center',
  },
  pageTitle: {
    textAlign: 'center',
    marginBottom: spacing[2],
  },
  pageSubtitle: {
    textAlign: 'center',
  },
  settingsSection: {
    paddingHorizontal: spacing.pageHorizontalMargin,
    gap: spacing[4],
  },
  topSpacing: {
    marginTop: spacing[6],
  },
  footer: {
    padding: spacing.pageHorizontalMargin,
    paddingBottom: spacing[8],
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing[4],
  },
  button: {
    flex: 1,
  },
});
