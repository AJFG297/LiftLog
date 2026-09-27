import { IndeterminateProgress } from '@/components/presentation/foundation/indeterminate-progress';
import { useAppTheme, spacing, fontFamily } from '@/hooks/useAppTheme';
import { T } from '@tolgee/react';
import { ReactNode } from 'react';
import { Text, View } from 'react-native';

interface LoaderProps {
  children?: ReactNode;
  loadingText?: string;
}
export function Loader(props: LoaderProps) {
  const { colors } = useAppTheme();
  return (
    <View
      style={{
        justifyContent: 'center',
        marginVertical: 'auto',
        alignItems: 'center',
        gap: spacing[4],
      }}
    >
      <IndeterminateProgress />
      {props.children ?? (
        <Text style={{ fontFamily: fontFamily.text, color: colors.onSurface, textAlign: 'center' }}>
          {props.loadingText ?? <T keyName="generic.loading.label" />}
        </Text>
      )}
    </View>
  );
}
