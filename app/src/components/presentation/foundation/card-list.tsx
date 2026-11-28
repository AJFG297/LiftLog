import { spacing } from '@/hooks/useAppTheme';
import { Key, ReactElement, ReactNode } from 'react';
import { Pressable, StyleProp, View, ViewProps, ViewStyle } from 'react-native';
import { Card } from '@/components/presentation/foundation/card';

interface CardListProps<T> extends ViewProps {
  items: readonly T[];
  renderItemContent: (item: T, index: number) => ReactElement;
  renderItemActions?: (item: T, index: number) => ReactElement;
  renderItemTitle?: (item: T, index: number) => ReactElement;

  onPress?: (item: T, index: number) => void;
  onLongPress?: (item: T, index: number) => void;
  shouldHighlight?: (item: T, index: number) => boolean;
  cardStyle?: StyleProp<ViewStyle>;
  /** Kept for callers; every card draws the same token card now. */
  cardType: 'elevated' | 'outlined' | 'contained';
  keySelector?: (item: T) => Key;
  emptyTemplate?: ReactNode;
}

export default function CardList<T>(props: CardListProps<T>) {
  const {
    items,
    renderItemContent,
    renderItemActions,
    renderItemTitle,
    onPress,
    onLongPress,
    shouldHighlight,
    cardStyle,
    cardType: _cardType,
    keySelector,
    emptyTemplate,
    ...rest
  } = props;
  return (
    <View
      {...rest}
      style={[
        {
          gap: spacing[2],
          flex: 1,
        },
        rest['style'],
      ]}
    >
      {!!items.length || emptyTemplate}
      {items.map((item, i) => {
        const title = renderItemTitle && {
          ...renderItemTitle(item, i),
          key: 'title',
        };
        const content = { ...renderItemContent(item, i), key: 'content' };
        const actions = renderItemActions && {
          ...renderItemActions(item, i),
          key: 'actions',
        };
        const key = keySelector?.(item) ?? i;
        const style = [cardStyle, shouldHighlight?.(item, i) ? highlightStyle : undefined];
        const children = [title, content, actions].filter(Boolean);
        // Our Card only takes a tap, so a long press needs its own Pressable around it.
        if (onLongPress) {
          return (
            <Pressable
              key={key}
              accessibilityRole="button"
              onPress={onPress ? () => onPress(item, i) : undefined}
              onLongPress={() => onLongPress(item, i)}
            >
              <Card style={style}>{children}</Card>
            </Pressable>
          );
        }
        return onPress ? (
          <Card key={key} style={style} onPress={() => onPress(item, i)}>
            {children}
          </Card>
        ) : (
          <Card key={key} style={style}>
            {children}
          </Card>
        );
      })}
    </View>
  );
}

const highlightStyle = {};
