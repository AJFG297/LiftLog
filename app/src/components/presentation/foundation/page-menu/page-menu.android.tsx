import IconButton from '@/components/presentation/foundation/icon-button';
import Menu from '@/components/presentation/foundation/menu';
import { PageMenuProps } from './page-menu-props';
import { useTranslate } from '@tolgee/react';
import { Stack } from 'expo-router';

export default function PageMenu({ items, actions, testID }: PageMenuProps) {
  const { t } = useTranslate();
  return (
    <Stack.Screen
      options={{
        headerRight: () => (
          <>
            {actions}
            <Menu
              trigger={(open) => (
                <IconButton
                  testID={testID}
                  icon="moreVert"
                  accessibilityLabel={t('generic.more_options.button')}
                  onPress={open}
                />
              )}
              items={items}
            />
          </>
        ),
      }}
    />
  );
}
