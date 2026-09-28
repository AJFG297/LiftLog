import { AppThemeColors, fontFamily, numberStyle } from '@/hooks/useAppTheme';
import { BarChartPropsType, CurveType, LineChartPropsType } from 'react-native-gifted-charts';

/**
 * The charts draw their axis labels as plain RN Text, which has no family of its own. Word labels (dates,
 * the reference line) get Geist; bare-number labels (the value axis, rep counts) get Geist Mono.
 */
export const chartLabelStyles = (colors: AppThemeColors) => ({
  text: { color: colors.onSurface, fontFamily: fontFamily.text },
  number: { ...numberStyle, color: colors.onSurface },
});

export const lineGraphProps = (colors: AppThemeColors, width: number, numberOfPoints: number): LineChartPropsType => {
  const calculatedSpacing = numberOfPoints > 1 ? width / (numberOfPoints - 1) - 50 / numberOfPoints : 1;
  const spacing = Math.max(calculatedSpacing, 50);
  const labels = chartLabelStyles(colors);
  return {
    focusEnabled: true,
    textColor: colors.onSurface,
    xAxisColor: 'transparent',
    yAxisColor: 'transparent',
    xAxisIndicesColor: colors.onSurface,
    yAxisIndicesColor: colors.onSurface,
    thickness: 3,
    curved: true,
    curveType: CurveType.CUBIC,
    curvature: 0.1,
    hideYAxisText: false,
    rulesColor: colors.outlineVariant,
    rulesLength: width - 30,
    rulesType: 'solid',
    hideRules: false,
    scrollToEnd: true,
    extrapolateMissingValues: false,
    width: width - 30,
    spacing,
    referenceLine1Config: {
      width: width - 30,
      color: colors.tertiary,
      labelTextStyle: labels.text,
    },
    xAxisLabelTextStyle: labels.text,
    yAxisTextStyle: labels.number,
  };
};

export const verticalBarChartProps = (colors: AppThemeColors, width: number): BarChartPropsType => {
  const labels = chartLabelStyles(colors);
  return {
    barBorderRadius: 2,
    xAxisColor: 'transparent',
    yAxisColor: 'transparent',
    xAxisIndicesColor: colors.onSurface,
    yAxisIndicesColor: colors.onSurface,
    hideYAxisText: false,
    rulesColor: colors.outlineVariant,
    rulesLength: width - 30,
    rulesType: 'solid',
    hideRules: false,
    scrollToEnd: true,
    width: width - 30,
    xAxisLabelTextStyle: labels.text,
    referenceLine1Config: {
      width: width - 30,
      color: colors.tertiary,
      labelTextStyle: labels.text,
    },
    yAxisTextStyle: labels.number,
  };
};
