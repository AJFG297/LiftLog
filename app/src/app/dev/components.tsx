import FullHeightScrollView from '@/components/layout/full-height-scroll-view';
import { Card } from '@/components/presentation/foundation/card';
import { Chip } from '@/components/presentation/foundation/chip';
import { haptics } from '@/components/presentation/foundation/haptics';
import { ListRow } from '@/components/presentation/foundation/list-row';
import { AppIcon } from '@/components/presentation/foundation/ms-icon-source';
import { ProgressBar } from '@/components/presentation/foundation/progress-bar';
import { RoundIconButton } from '@/components/presentation/foundation/round-icon-button';
import { SegmentedControl } from '@/components/presentation/foundation/segmented-control';
import { SetBadge } from '@/components/presentation/foundation/set-badge';
import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { useToast } from '@/components/presentation/foundation/toast';
import { spacing, useAppTheme } from '@/hooks/useAppTheme';
import { useAppSelector } from '@/store';
import { setColorSchemeSeed, setThemeMode } from '@/store/settings';
import { ACCENT_PRESETS } from '@/utils/theme-tokens';
import { Redirect, Stack, useRouter } from 'expo-router';
import { ReactNode, useState } from 'react';
import { View } from 'react-native';
import { useDispatch } from 'react-redux';

const RPE_VALUES = [6, 7, 7.5, 8, 8.5, 9, 9.5, 10];
const REST_PRESETS = ['0:30', '1:00', '1:30', '2:00', '2:30', '3:00'];
const MUSCLES = ['Chest', 'Back', 'Legs', 'Shoulders'];

/**
 * Every foundation primitive on one page, for checking them in light and dark and with different accents.
 * Not linked from the app; open `liftlog://dev/components`. English only.
 */
export default function DevComponentsRoute() {
  if (!__DEV__) {
    return <Redirect href="/" />;
  }
  return <DevComponents />;
}

function DevComponents() {
  return (
    <FullHeightScrollView
      scrollStyle={{ paddingHorizontal: spacing.pageHorizontalMargin }}
      contentContainerStyle={{ gap: spacing[6], paddingVertical: spacing[4] }}
    >
      <Stack.Screen options={{ title: 'Components' }} />
      <ThemeSection />
      <CardSection />
      <ChipSection />
      <SegmentedSection />
      <IconButtonSection />
      <ListRowSection />
      <SetBadgeSection />
      <ProgressSection />
      <ToastAndSheetSection />
      <HapticsSection />
    </FullHeightScrollView>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const { tokens } = useAppTheme();
  return (
    <View style={{ gap: spacing[3] }}>
      <SurfaceText font="text-xs" weight="600" accessibilityRole="header" style={{ color: tokens.muted }}>
        {title.toUpperCase()}
      </SurfaceText>
      {children}
    </View>
  );
}

function ThemeSection() {
  const dispatch = useDispatch();
  const { colorScheme } = useAppTheme();
  const seed = useAppSelector((s) => s.settings.colorSchemeSeed);
  return (
    <Section title="Theme">
      <SegmentedControl
        accessibilityLabel="Theme mode"
        options={[
          { value: 'light', label: 'Light' },
          { value: 'dark', label: 'Dark' },
        ]}
        value={colorScheme}
        onChange={(mode) => dispatch(setThemeMode(mode))}
      />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
        {ACCENT_PRESETS.map((preset) => (
          <Chip
            key={preset.key}
            label={preset.key}
            selected={seed === preset.seed}
            onPress={() => dispatch(setColorSchemeSeed(preset.seed))}
          />
        ))}
      </View>
    </Section>
  );
}

function CardSection() {
  const { tokens } = useAppTheme();
  const [presses, setPresses] = useState(0);
  return (
    <Section title="Card">
      <Card>
        <SurfaceText font="text-base" weight="600" style={{ color: tokens.ink }}>
          Push day
        </SurfaceText>
        <SurfaceText font="text-sm" style={{ color: tokens.muted }}>
          Bench press, overhead press, dips
        </SurfaceText>
      </Card>
      <Card onPress={() => setPresses(presses + 1)} accessibilityHint="Counts presses">
        <SurfaceText font="text-base" weight="600" style={{ color: tokens.ink }}>
          Pressable card
        </SurfaceText>
        <SurfaceText font="text-sm" style={{ color: tokens.muted }}>
          Pressed <SurfaceText numeric>{presses}</SurfaceText> times
        </SurfaceText>
      </Card>
    </Section>
  );
}

function ChipSection() {
  const [muscles, setMuscles] = useState<string[]>(['Chest']);
  const [rpe, setRpe] = useState<number | undefined>(8);
  const [rest, setRest] = useState('2:00');
  return (
    <Section title="Chip">
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
        {MUSCLES.map((muscle) => (
          <Chip
            key={muscle}
            label={muscle}
            selected={muscles.includes(muscle)}
            onPress={() =>
              setMuscles(muscles.includes(muscle) ? muscles.filter((m) => m !== muscle) : [...muscles, muscle])
            }
          />
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: spacing[2] }}>
        {RPE_VALUES.map((value) => (
          <Chip
            key={value}
            label={String(value)}
            numeric
            accessibilityLabel={`RPE ${value}`}
            selected={rpe === value}
            onPress={() => setRpe(rpe === value ? undefined : value)}
            style={{ flexGrow: 1, paddingHorizontal: 0 }}
          />
        ))}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
        {REST_PRESETS.map((preset) => (
          <Chip key={preset} label={preset} numeric selected={rest === preset} onPress={() => setRest(preset)} />
        ))}
      </View>
    </Section>
  );
}

function SegmentedSection() {
  const [range, setRange] = useState<'7' | '30'>('7');
  const [period, setPeriod] = useState<'week' | 'month' | 'year'>('month');
  return (
    <Section title="Segmented control">
      <SegmentedControl
        accessibilityLabel="History range"
        options={[
          { value: '7', label: 'Last 7 days' },
          { value: '30', label: 'Last 30 days' },
        ]}
        value={range}
        onChange={setRange}
      />
      <SegmentedControl
        accessibilityLabel="Chart period"
        options={[
          { value: 'week', label: 'Week' },
          { value: 'month', label: 'Month' },
          { value: 'year', label: 'Year' },
        ]}
        value={period}
        onChange={setPeriod}
      />
    </Section>
  );
}

function IconButtonSection() {
  const toast = useToast();
  return (
    <Section title="Round icon button">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
        <RoundIconButton icon="close" accessibilityLabel="Close" onPress={() => toast.show({ message: 'Close' })} />
        <RoundIconButton icon="add" accessibilityLabel="Add" onPress={() => toast.show({ message: 'Add' })} />
        <RoundIconButton
          icon="moreHoriz"
          size="compact"
          accessibilityLabel="More"
          onPress={() => toast.show({ message: 'More' })}
        />
        <RoundIconButton icon="delete" disabled accessibilityLabel="Delete" onPress={() => {}} />
      </View>
    </Section>
  );
}

function ListRowSection() {
  const { tokens } = useAppTheme();
  const toast = useToast();
  return (
    <Section title="List row">
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <ListRow
          title="Bench press"
          subtitle="Barbell · rest 2:30"
          leading={<SetBadge kind="working" number={1} />}
          trailing={
            <SurfaceText font="text-sm" style={{ color: tokens.muted }}>
              5 × 5
            </SurfaceText>
          }
        />
        <View style={{ height: 1, backgroundColor: tokens.line }} />
        <ListRow
          title="Overhead press"
          subtitle="Pressable row"
          onPress={() => toast.show({ message: 'Overhead press' })}
          trailing={<AppIcon name="chevronRight" size={20} color={tokens.faint} />}
        />
      </Card>
    </Section>
  );
}

function SetBadgeSection() {
  return (
    <Section title="Set badge">
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
        <SetBadge kind="warmup" />
        <SetBadge kind="working" number={1} />
        <SetBadge kind="working" number={12} />
        <SetBadge kind="drop" />
        <SetBadge kind="myo" />
        <SetBadge kind="failure" />
      </View>
    </Section>
  );
}

function ProgressSection() {
  return (
    <Section title="Progress bar">
      <ProgressBar progress={0} accessibilityLabel="Empty" />
      <ProgressBar progress={0.35} accessibilityLabel="Rest" />
      <ProgressBar progress={1} height={8} accessibilityLabel="Sets done" />
    </Section>
  );
}

function ToastAndSheetSection() {
  const { tokens } = useAppTheme();
  const toast = useToast();
  const router = useRouter();
  const chevron = <AppIcon name="chevronRight" size={20} color={tokens.faint} />;
  return (
    <Section title="Toast and sheet">
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <ListRow title="Show a toast" trailing={chevron} onPress={() => toast.show({ message: 'Workout saved' })} />
        <ListRow
          title="Show a toast with Undo"
          trailing={chevron}
          onPress={() =>
            toast.show({
              message: 'Set removed',
              action: { label: 'Undo', onPress: () => toast.show({ message: 'Set restored' }) },
            })
          }
        />
        <ListRow
          title="Open a sheet"
          subtitle="formSheetOptions([0.5, 0.9]) and SheetHeader"
          trailing={chevron}
          onPress={() => router.push('/dev/components-sheet')}
        />
      </Card>
    </Section>
  );
}

function HapticsSection() {
  const { tokens } = useAppTheme();
  const chevron = <AppIcon name="chevronRight" size={20} color={tokens.faint} />;
  return (
    <Section title="Haptics">
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <ListRow title="Set logged" trailing={chevron} onPress={haptics.setLogged} />
        <ListRow title="Rest over" trailing={chevron} onPress={haptics.restOver} />
        <ListRow title="Selection" trailing={chevron} onPress={haptics.selection} />
      </Card>
    </Section>
  );
}
