import { MenuProps } from './menu-props';
import { useAppTheme } from '@/hooks/useAppTheme';
import { Button, Host, Menu as NativeMenu } from '@expo/ui/swift-ui';
import { disabled, frame } from '@expo/ui/swift-ui/modifiers';

export default function Menu({ trigger, items, testID, size = 40 }: MenuProps) {
  const { colors } = useAppTheme();
  const fitsContent = size === 'content';

  return (
    <Host
      matchContents={fitsContent}
      style={fitsContent ? undefined : { width: size, height: size, margin: 6 }}
      seedColor={colors.seedColor}
      colorScheme={colors.scheme}
    >
      <NativeMenu
        label={trigger(() => {})}
        testID={testID}
        modifiers={fitsContent ? undefined : [frame({ width: size, height: size })]}
      >
        {items.map((item) => (
          <Button
            key={item.label}
            role={item.destructive ? 'destructive' : undefined}
            systemImage={item.selected ? 'checkmark' : item.systemImage}
            label={item.label}
            onPress={item.onPress}
            modifiers={item.disabled ? [disabled(true)] : undefined}
          />
        ))}
      </NativeMenu>
    </Host>
  );
}
