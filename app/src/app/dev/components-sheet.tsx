import { haptics } from '@/components/presentation/foundation/haptics';
import { ListRow } from '@/components/presentation/foundation/list-row';
import { SetBadge, type SetBadgeProps } from '@/components/presentation/foundation/set-badge';
import { SheetHeader } from '@/components/presentation/foundation/sheet-header';
import { useToast } from '@/components/presentation/foundation/toast';
import { spacing, useAppTheme } from '@/hooks/useAppTheme';
import { useRouter } from 'expo-router';
import { View } from 'react-native';

const OPTIONS: { badge: SetBadgeProps; title: string; subtitle: string }[] = [
  { badge: { kind: 'working', number: 2 }, title: 'Working set', subtitle: 'Counts towards volume and PRs' },
  { badge: { kind: 'warmup' }, title: 'Warm-up', subtitle: 'Not counted in volume or PRs' },
  { badge: { kind: 'drop' }, title: 'Drop set', subtitle: 'Lower the weight and keep going' },
  { badge: { kind: 'myo' }, title: 'Myo-reps', subtitle: 'Mini-sets after an activation set' },
  { badge: { kind: 'failure' }, title: 'To failure', subtitle: 'Stopped when another rep was not possible' },
];

export default function DevComponentsSheet() {
  const { tokens } = useAppTheme();
  const router = useRouter();
  const toast = useToast();
  return (
    <View style={{ flex: 1, backgroundColor: tokens.card, paddingHorizontal: spacing.pageHorizontalMargin }}>
      <SheetHeader title="Set type" subtitle="Bench press · set 2" onClose={() => router.back()} />
      {OPTIONS.map((option) => (
        <ListRow
          key={option.title}
          title={option.title}
          subtitle={option.subtitle}
          leading={<SetBadge {...option.badge} />}
          style={{ paddingHorizontal: 0 }}
          onPress={() => {
            haptics.selection();
            router.back();
            toast.show({
              message: `Changed to ${option.title.toLowerCase()}`,
              action: { label: 'Undo', onPress: () => {} },
            });
          }}
        />
      ))}
    </View>
  );
}
