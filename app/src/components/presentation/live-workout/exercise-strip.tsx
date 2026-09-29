import { MsIconSrc } from '@/components/presentation/foundation/ms-icon-source';
import { ProgressBar } from '@/components/presentation/foundation/progress-bar';
import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { spacing, useAppTheme } from '@/hooks/useAppTheme';
import { useTranslate } from '@tolgee/react';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

const TILE_WIDTH = 118;
const TILE_MIN_HEIGHT = 78;
const ADD_TILE_WIDTH = 56;
const GAP = spacing[2];
const SIDE = spacing.pageHorizontalMargin;

export interface ExerciseStripTile {
  key: string;
  /** "3", or "A1" in a superset. */
  label: string;
  name: string;
  done: number;
  total: number;
  isCurrent: boolean;
  isComplete: boolean;
  isSuperset: boolean;
  onPress: () => void;
}

interface ExerciseStripProps {
  tiles: ExerciseStripTile[];
  onAddExercise: () => void;
}

/** One tile per exercise across the top of the live workout. Keeps the current tile in view. */
export function ExerciseStrip({ tiles, onAddExercise }: ExerciseStripProps) {
  const { tokens } = useAppTheme();
  const { t } = useTranslate();
  const scrollRef = useRef<ScrollView>(null);
  const [viewWidth, setViewWidth] = useState(0);
  const currentIndex = tiles.findIndex((tile) => tile.isCurrent);
  const contentWidth = SIDE * 2 + tiles.length * (TILE_WIDTH + GAP) + ADD_TILE_WIDTH;

  useEffect(() => {
    if (currentIndex < 0 || !viewWidth) {
      return;
    }
    const centred = SIDE + currentIndex * (TILE_WIDTH + GAP) + TILE_WIDTH / 2 - viewWidth / 2;
    const x = Math.max(0, Math.min(centred, contentWidth - viewWidth));
    scrollRef.current?.scrollTo({ x, animated: true });
  }, [currentIndex, viewWidth, contentWidth]);

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      onLayout={(event) => setViewWidth(event.nativeEvent.layout.width)}
      style={{ flexGrow: 0 }}
      contentContainerStyle={{ gap: GAP, paddingHorizontal: SIDE, paddingVertical: spacing[1] }}
    >
      {tiles.map((tile, index) => (
        <StripTile key={tile.key} tile={tile} testID={`exercise-tile-${index}`} />
      ))}
      <Pressable
        testID="strip-add-exercise"
        onPress={onAddExercise}
        accessibilityRole="button"
        accessibilityLabel={t('exercise.add.title')}
        style={({ pressed }) => ({
          width: ADD_TILE_WIDTH,
          minHeight: TILE_MIN_HEIGHT,
          borderRadius: 14,
          borderWidth: 1.5,
          borderStyle: 'dashed',
          borderColor: tokens.line3,
          backgroundColor: pressed ? tokens.track : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
        })}
      >
        <MsIconSrc name="add" size={20} color={tokens.muted} />
      </Pressable>
    </ScrollView>
  );
}

function StripTile({ tile, testID }: { tile: ExerciseStripTile; testID: string }) {
  const { tokens } = useAppTheme();
  const { t } = useTranslate();
  const current = tile.isCurrent;
  const sub = current ? tokens.inverseMuted : tile.isSuperset ? tokens.accentInk : tokens.muted;
  return (
    <Pressable
      testID={testID}
      onPress={tile.onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: current }}
      accessibilityLabel={t('live_workout.tile.label', { name: tile.name, done: tile.done, total: tile.total })}
      style={({ pressed }) => ({
        width: TILE_WIDTH,
        minHeight: TILE_MIN_HEIGHT,
        borderRadius: 14,
        padding: spacing[2],
        justifyContent: 'space-between',
        gap: spacing[1],
        backgroundColor: current ? tokens.inverse : pressed ? tokens.track : tokens.card,
        borderWidth: current ? 0 : 1,
        borderColor: tile.isComplete ? tokens.accentLine : tokens.line,
      })}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <SurfaceText font="text-xs" weight="700" style={{ color: sub }}>
          {tile.label}
        </SurfaceText>
        <SurfaceText font="text-xs" numeric weight="500" style={{ color: sub }}>
          {`${tile.done}/${tile.total}`}
        </SurfaceText>
      </View>
      <SurfaceText
        font="text-sm"
        weight="600"
        numberOfLines={2}
        style={{ color: current ? tokens.inverseInk : tokens.ink }}
      >
        {tile.name}
      </SurfaceText>
      <ProgressBar
        progress={tile.total ? tile.done / tile.total : 0}
        accessibilityLabel={tile.name}
        tone={current ? 'inverse' : 'default'}
      />
    </Pressable>
  );
}
