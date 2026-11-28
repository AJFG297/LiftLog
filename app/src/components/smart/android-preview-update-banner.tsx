import { AndroidPreviewUpdateBannerView } from '@/components/presentation/home/android-preview-update-banner';
import {
  AndroidPreviewRelease,
  AndroidPreviewRuntime,
  isAndroidPreviewRuntime,
  resolveAndroidPreviewUpdateOffer,
} from '@/models/android-preview-update';
import { currentAndroidPreviewRuntime, fetchAndroidPreviewRelease } from '@/services/android-preview-update';
import { useAppSelector } from '@/store';
import { setDismissedAndroidPreviewReleaseId } from '@/store/settings';
import { openUrl } from '@/utils/open-url';
import { useTranslate } from '@tolgee/react';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useDispatch } from 'react-redux';

const MIN_RECHECK_INTERVAL_MS = 30 * 60 * 1000;

const defaultFetchRelease = (signal: AbortSignal) => fetchAndroidPreviewRelease({ signal });

export interface AndroidPreviewUpdateBannerProps {
  /** Overrides for tests. */
  runtime?: AndroidPreviewRuntime;
  fetchRelease?: (signal: AbortSignal) => Promise<AndroidPreviewRelease | undefined>;
  onOpenUrl?: (url: string) => void;
}

/**
 * Checks for a newer signed Android preview APK and renders a dismissible Home banner when the
 * installed native runtime is explicitly eligible. Independent of bundled What's New entries.
 */
export function AndroidPreviewUpdateBanner({
  runtime = currentAndroidPreviewRuntime(),
  fetchRelease = defaultFetchRelease,
  onOpenUrl = openUrl,
}: AndroidPreviewUpdateBannerProps = {}) {
  const { t } = useTranslate();
  const dispatch = useDispatch();
  const isHydrated = useAppSelector((x) => x.settings.isHydrated);
  const dismissedReleaseId = useAppSelector((x) => x.settings.dismissedAndroidPreviewReleaseId);
  const [release, setRelease] = useState<AndroidPreviewRelease | undefined>(undefined);
  const eligibleChannel = isAndroidPreviewRuntime(runtime);

  useEffect(() => {
    if (!eligibleChannel) {
      return;
    }

    let cancelled = false;
    let activeController: AbortController | undefined;
    let lastSuccessAt: number | undefined;

    const load = () => {
      if (activeController) {
        return;
      }
      if (lastSuccessAt !== undefined && Date.now() - lastSuccessAt < MIN_RECHECK_INTERVAL_MS) {
        return;
      }
      const controller = new AbortController();
      activeController = controller;
      void fetchRelease(controller.signal).then((fetched) => {
        if (activeController === controller) {
          activeController = undefined;
        }
        if (cancelled || !fetched) {
          return;
        }
        lastSuccessAt = Date.now();
        setRelease(fetched);
      });
    };

    load();

    // Retry when returning to the foreground if startup was offline, or refresh on a later session.
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        load();
      }
    });

    return () => {
      cancelled = true;
      activeController?.abort();
      subscription.remove();
    };
  }, [eligibleChannel, fetchRelease]);

  if (!isHydrated) {
    return null;
  }

  const offer = resolveAndroidPreviewUpdateOffer({
    runtime,
    release,
    dismissedReleaseId,
  });

  if (!offer) {
    return null;
  }

  return (
    <AndroidPreviewUpdateBannerView
      title={t('android_preview_update.title')}
      body={t('android_preview_update.body')}
      downloadLabel={t('android_preview_update.download.button')}
      dismissLabel={t('android_preview_update.dismiss.button')}
      onDownload={() => onOpenUrl(offer.installUrl)}
      onDismiss={() => dispatch(setDismissedAndroidPreviewReleaseId(offer.releaseId))}
    />
  );
}
