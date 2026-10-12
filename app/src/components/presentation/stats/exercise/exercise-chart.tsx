import { haptics } from '@/components/presentation/foundation/haptics';
import {
  exerciseChartGeometry,
  nearestPointIndex,
} from '@/components/presentation/stats/geometry/exercise-chart-geometry';
import { fontFamily, useAppTheme } from '@/hooks/useAppTheme';
import { useState } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';

const CHART_HEIGHT = 172;

interface ExerciseChartProps {
  /** One per workout, oldest first, as shown. */
  values: readonly number[];
  /** Which workouts get a record dot. */
  dots: readonly boolean[];
  selected: number;
  onSelect: (index: number) => void;
  /** A grid line's label: "75", "4,000". */
  gridLabel: (value: number) => string;
  /** The first, middle and last workouts' dates, short. */
  dateLabel: (index: number) => string;
  /** Names the chart for screen readers: "Estimated one-rep max". */
  accessibilityLabel: string;
  /** The picked workout read out: "Sep 23, 104.5 kg". */
  accessibilityValue: string;
}

/**
 * The exercise page's line chart. A tap or a drag across it picks the nearest workout; a vertical drag still
 * scrolls the page. Screen readers adjust it to move the pick one workout at a time.
 */
export function ExerciseChart(props: ExerciseChartProps) {
  const { tokens } = useAppTheme();
  const [width, setWidth] = useState(0);
  const geometry = width ? exerciseChartGeometry(props.values, width, CHART_HEIGHT) : undefined;
  const count = props.values.length;

  const pick = (x: number) => {
    if (!geometry) {
      return;
    }
    const index = nearestPointIndex(geometry.points, x);
    if (index !== props.selected) {
      haptics.selection();
      props.onSelect(index);
    }
  };
  // Horizontal only, so a vertical drag fails it and the page scrolls.
  const drag = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetX([-6, 6])
    .failOffsetY([-12, 12])
    .onStart((event) => pick(event.x))
    .onUpdate((event) => pick(event.x));
  const tap = Gesture.Tap()
    .runOnJS(true)
    .onEnd((event) => pick(event.x));

  const selectedPoint = geometry?.points[props.selected];
  const middle = Math.floor((count - 1) / 2);
  const dateIndexes = count === 1 ? [0] : count === 2 ? [0, 1] : [0, middle, count - 1];

  return (
    <GestureDetector gesture={Gesture.Race(drag, tap)}>
      <View
        testID="exercise-chart"
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={props.accessibilityLabel}
        accessibilityValue={{ text: props.accessibilityValue }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(event) => {
          const next = props.selected + (event.nativeEvent.actionName === 'increment' ? 1 : -1);
          if (next >= 0 && next < count) {
            props.onSelect(next);
          }
        }}
        onLayout={(event) => setWidth(Math.round(event.nativeEvent.layout.width))}
        style={{ height: CHART_HEIGHT }}
      >
        {geometry ? (
          <Svg width={width} height={CHART_HEIGHT}>
            {geometry.grid.map((line) => (
              <Line
                key={line.value}
                x1={0}
                x2={geometry.right + 6}
                y1={line.y}
                y2={line.y}
                stroke={tokens.line}
                strokeWidth={1}
              />
            ))}
            {geometry.grid.map((line) => (
              <SvgText
                key={`label-${line.value}`}
                x={width}
                y={line.y + 4}
                textAnchor="end"
                fontFamily={fontFamily.number}
                fontSize={11}
                fontWeight="500"
                fill={tokens.muted}
              >
                {props.gridLabel(line.value)}
              </SvgText>
            ))}
            {selectedPoint ? (
              <Line
                x1={selectedPoint.x}
                x2={selectedPoint.x}
                y1={8}
                y2={geometry.bottom + 6}
                stroke={tokens.line3}
                strokeWidth={1}
                strokeDasharray="3 3"
              />
            ) : null}
            {geometry.path ? (
              <Path
                d={geometry.path}
                stroke={tokens.accentInk}
                strokeWidth={2.2}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            ) : null}
            {geometry.points.map((point, index) =>
              props.dots[index] ? (
                <Circle
                  key={`dot-${index}`}
                  cx={point.x}
                  cy={point.y}
                  r={3.2}
                  fill={tokens.accentInk}
                  stroke={tokens.card}
                  strokeWidth={1.5}
                />
              ) : null,
            )}
            {selectedPoint ? (
              <Circle
                cx={selectedPoint.x}
                cy={selectedPoint.y}
                r={5.5}
                fill={tokens.accentInk}
                stroke={tokens.card}
                strokeWidth={2.5}
              />
            ) : null}
            {dateIndexes.map((index, position) => (
              <SvgText
                key={`date-${index}`}
                x={geometry.points[index]!.x}
                y={CHART_HEIGHT - 6}
                textAnchor={
                  count === 1 || (position === 1 && dateIndexes.length === 3)
                    ? 'middle'
                    : position === 0
                      ? 'start'
                      : 'end'
                }
                fontFamily={fontFamily.text}
                fontSize={11}
                fontWeight="500"
                fill={tokens.muted}
              >
                {props.dateLabel(index)}
              </SvgText>
            ))}
          </Svg>
        ) : null}
      </View>
    </GestureDetector>
  );
}
