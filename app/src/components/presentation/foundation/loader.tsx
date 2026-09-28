import { IndeterminateProgress } from '@/components/presentation/foundation/indeterminate-progress';
import { spacing } from '@/hooks/useAppTheme';
import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { T } from '@tolgee/react';
import { ReactNode } from 'react';
import { View } from 'react-native';

interface LoaderProps {
  children?: ReactNode;
  loadingText?: string;
}
export function Loader(props: LoaderProps) {
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
        <SurfaceText font="text-sm" style={{ textAlign: 'center' }}>
          {props.loadingText ?? <T keyName="generic.loading.label" />}
        </SurfaceText>
      )}
    </View>
  );
}
