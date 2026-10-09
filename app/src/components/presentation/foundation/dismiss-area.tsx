import { ReactNode } from 'react';
import { Pressable, StyleProp, ViewStyle } from 'react-native';

/**
 * The background of a sheet's scrolling content, which closes an open layer (the in-sheet number pad) on a tap
 * that nothing inside took (docs/UX.md, "Dismiss the innermost layer first"). A field, a row or any other control
 * becomes the responder first, so a tap on another pad field moves the pad there in one tap. A drag that turns
 * into a scroll takes the touch from it and cancels the press, so scrolling never closes the layer. Put the pad
 * itself outside this area.
 *
 * Give the scroll view `keyboardShouldPersistTaps="handled"` and `contentContainerStyle={{ flexGrow: 1 }}`, and put
 * the content's padding and gap on `style`, so the area reaches every edge of the content.
 */
export function DismissArea(props: {
  /** Whether a layer is open. While none is, the area takes no taps. */
  open: boolean;
  onDismiss: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  children: ReactNode;
}) {
  return (
    <Pressable
      testID={props.testID}
      onPress={props.onDismiss}
      disabled={!props.open}
      // Not a control of its own: screen readers keep reading the content's items one by one.
      accessible={false}
      android_disableSound
      style={[{ flexGrow: 1 }, props.style]}
    >
      {props.children}
    </Pressable>
  );
}
