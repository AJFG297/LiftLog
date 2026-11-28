import React, { useState, useEffect } from 'react';
import { TextStyle } from 'react-native';
import { TextField, TextFieldProps } from '@/components/presentation/foundation/text-field';
import { numberStyle } from '@/hooks/useAppTheme';
import { splitTextStyle } from '@/components/presentation/foundation/editors/split-text-style';

interface IntegerEditorProps {
  value: number;
  onChange: (val: number) => void;
  /** Text properties (colour, alignment) style the number; the rest style the field's box. */
  style?: TextStyle;
  testID?: string;
}

export function IntegerEditor(props: IntegerEditorProps & Partial<Omit<TextFieldProps, keyof IntegerEditorProps>>) {
  const { value, onChange, style, contentStyle, testID, ...rest } = props;
  const { boxStyle, textStyle } = splitTextStyle(style);
  const [text, setText] = useState(props.value.toString());
  const [editorValue, setEditorValue] = useState(value);

  const handleTextChange = (text: string) => {
    setText(text);
    if (text.trim() === '') {
      setEditorValue(0);
      onChange(0);
      return;
    }

    const parsed = Number.parseInt(text);
    if (!Number.isNaN(parsed)) {
      setEditorValue(parsed);
      onChange(parsed);
      return;
    }
  };
  useEffect(() => {
    if (editorValue !== value) {
      setText(value.toString() || '0');
      setEditorValue(value);
    }
  }, [value, editorValue]);
  return (
    <TextField
      testID={testID}
      value={text}
      inputMode={'numeric'}
      keyboardType={'numeric'}
      onChangeText={handleTextChange}
      selectTextOnFocus
      style={boxStyle}
      contentStyle={[numberStyle, textStyle, contentStyle]}
      onBlur={() => {
        if (text === '') {
          setText('0');
        }
        onChange(editorValue);
      }}
      {...rest}
    />
  );
}
