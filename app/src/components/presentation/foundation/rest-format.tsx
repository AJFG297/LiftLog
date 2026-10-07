import React from 'react';
import { TextProps } from 'react-native';
import { Rest } from '@/models/blueprint-models';
import { formatTimeSpan } from '@/utils/format-time-span';
import { Text } from 'react-native-paper';
import { numberStyle } from '@/hooks/useAppTheme';

interface RestFormatProps {
  rest: Rest;
}

export default function RestFormat({ rest }: RestFormatProps & TextProps) {
  return (
    <Text style={numberStyle}>
      {formatTimeSpan(rest.rest)}
      {rest.failedSetRest && `, ${formatTimeSpan(rest.failedSetRest)}`}
    </Text>
  );
}

export { formatTimeSpan };
