import Icon from '@/components/presentation/foundation/icon';
import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { spacing, useAppTheme } from '@/hooks/useAppTheme';
import { AiChatSharedSpreadsheetMessage } from '@/models/ai-models';
import { useTranslate } from '@tolgee/react';
import { View } from 'react-native';

export function SharedSpreadsheetMessage({
  message,
  isUser,
}: {
  message: AiChatSharedSpreadsheetMessage;
  isUser: boolean;
}) {
  const { t } = useTranslate();
  const { colors } = useAppTheme();
  const color = isUser ? 'onPrimary' : 'onSurface';
  const sheetCount = message.sheets.length;
  const rowCount = message.sheets
    .flatMap((sheet) => sheet.rows)
    .filter((row) => row.some((cell) => cell.trim() !== '')).length;
  const caption = [
    sheetCount === 1
      ? t('ai.shared_spreadsheet.sheet_count.one')
      : t('ai.shared_spreadsheet.sheet_count.other', { count: sheetCount.toString() }),
    rowCount === 1
      ? t('ai.shared_spreadsheet.row_count.one')
      : t('ai.shared_spreadsheet.row_count.other', { count: rowCount.toString() }),
  ].join(' · ');
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
      <Icon source="table" size={28} color={colors[color]} />
      <View style={{ flexShrink: 1, gap: spacing[0.5] }}>
        <SurfaceText font="text-lg" weight="bold" color={color}>
          {message.fileName}
        </SurfaceText>
        <SurfaceText font="text-sm" color={color}>
          {caption}
        </SurfaceText>
      </View>
    </View>
  );
}
