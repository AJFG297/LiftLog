import { useToast } from '@/components/presentation/foundation/toast';
import { useAppSelector } from '@/store';
import { useEffect } from 'react';
import { useDispatch } from 'react-redux';

/**
 * Shows the store's `showSnackbar` messages, which effects raise without a component to call `useToast`
 * from, as toasts. Mounted inside the `ToastProvider`.
 */
export function SnackbarToasts() {
  const currentSnackbar = useAppSelector((s) => s.app.currentSnackbar);
  const dispatch = useDispatch();
  const toast = useToast();
  useEffect(() => {
    if (!currentSnackbar) {
      return;
    }
    const { text, action, onAction, dispatchAction } = currentSnackbar;
    toast.show({
      message: text,
      action: action
        ? {
            label: action,
            onPress: () => {
              if (onAction) {
                onAction();
              } else if (Array.isArray(dispatchAction)) {
                dispatchAction.forEach((x) => dispatch(x));
              } else if (dispatchAction) {
                dispatch(dispatchAction);
              }
            },
          }
        : undefined,
    });
    // Only a new snackbar shows a toast; `toast` is a fresh object each render.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSnackbar]);
  return null;
}
