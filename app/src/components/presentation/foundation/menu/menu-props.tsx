import { AppIconSource } from '@/components/presentation/foundation/ms-icon-source';
import { ReactNode } from 'react';
import { SFSymbol } from 'sf-symbols-typescript';

export interface MenuItem {
  label: string;
  onPress: () => void;
  icon?: AppIconSource;
  systemImage?: SFSymbol;
  destructive?: boolean;
  disabled?: boolean;
  /** Shows a checkmark, for a menu that chooses one value. */
  selected?: boolean;
}

export interface MenuProps {
  trigger: (open: () => void) => ReactNode;
  items: MenuItem[];
  testID?: string;
  /**
   * The square the trigger sits in, 40 by default. `'content'` lets the trigger size the menu, for a trigger
   * that isn't a square icon button.
   */
  size?: number | 'content';
}
