import {
  impactAsync,
  ImpactFeedbackStyle,
  notificationAsync,
  NotificationFeedbackType,
  selectionAsync,
} from 'expo-haptics';

function fire(feedback: Promise<void>) {
  // Devices without a haptic engine reject; there's nothing to tell the user.
  feedback.catch(() => {});
}

/**
 * The app's haptic vocabulary: one name per moment, so the same moment feels the same on every screen.
 * `Chip` and `SegmentedControl` already play `selection` when their value changes.
 */
export const haptics = {
  /** A set was ticked off. Played on every set, so it's a single firm tap rather than a pattern. */
  setLogged: () => fire(impactAsync(ImpactFeedbackStyle.Medium)),
  /** The rest timer ran out. A pattern, so it's noticeable with the phone in a pocket. */
  restOver: () => fire(notificationAsync(NotificationFeedbackType.Success)),
  /** A picked value changed: a chip, a segment, a picker step. */
  selection: () => fire(selectionAsync()),
};
