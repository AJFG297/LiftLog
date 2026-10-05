import { AiChatResponseV2, describeSharedProgramForAi } from '@/models/ai-models';
import { describeSpreadsheetForAi } from '@/services/plan-import';
import {
  addMessage,
  ChatMessage,
  clearPendingSpreadsheet,
  initChat,
  initializeAiPlannerStateSlice,
  restartChat,
  stopAiGenerator,
  setChat,
  updateMessage,
} from '@/store/ai-planner';
import { setIsHydrated } from '@/store/ai-planner';

import { clearBackendAssignment, removeBackend, selectAssignedBackendId, setBackendAssignment } from '@/store/backends';
import { selectPreferredWeightUnit } from '@/store/settings';
import { AddEffectFn } from '@/store/store';
import { uuid } from '@/utils/uuid';

export function applyAiPlannerEffects(addEffect: AddEffectFn) {
  addEffect(initializeAiPlannerStateSlice, async (_, { dispatch }) => {
    dispatch(setIsHydrated(true));
  });

  addEffect(addMessage, async ({ payload: message }, { dispatch, getState, extra: { aiChatService } }) => {
    if (message.from === 'Agent') {
      return;
    }
    let wireMessage: string;
    if (message.type === 'messageResponse') {
      wireMessage = message.message;
    } else if (message.type === 'sharedProgram') {
      wireMessage = describeSharedProgramForAi(message.programName, message.blueprint);
    } else if (message.type === 'sharedSpreadsheet') {
      wireMessage = describeSpreadsheetForAi(message.fileName, message.sheets, {
        locale: Intl.DateTimeFormat().resolvedOptions().locale,
        preferredWeightUnit: selectPreferredWeightUnit(getState()),
      });
    } else {
      return;
    }
    const originalMessage: ChatMessage = {
      from: 'Agent',
      id: uuid(),
      message: '',
      type: 'messageResponse',
      isLoading: true,
    };
    dispatch(addMessage(originalMessage));
    let latestMessage: AiChatResponseV2 | undefined = undefined;
    for await (const chatResponse of aiChatService.sendMessage(wireMessage)) {
      latestMessage = chatResponse;
      dispatch(
        updateMessage({
          id: originalMessage.id,
          from: 'Agent',
          isLoading: true,
          ...chatResponse,
        }),
      );
    }

    dispatch(
      updateMessage({
        id: originalMessage.id,
        from: 'Agent',
        ...(latestMessage ?? originalMessage),
        isLoading: false,
      }),
    );
  });
  addEffect(stopAiGenerator, async (_, { extra: { aiChatService } }) => {
    await aiChatService.stopInProgress();
  });

  // A chat lives on the server holding it, and the new server has never seen a word of it. Repointing
  // the planner therefore starts the chat again rather than leaving a transcript nothing can continue.
  addEffect(
    [setBackendAssignment, clearBackendAssignment, removeBackend],
    async (_, { dispatch, stateBeforeReduce, stateAfterReduce }) => {
      const before = selectAssignedBackendId(stateBeforeReduce, 'aiPlanner');
      const after = selectAssignedBackendId(stateAfterReduce, 'aiPlanner');
      if (before === after || !stateAfterReduce.aiPlanner.plannerChat.length) {
        return;
      }
      dispatch(restartChat());
    },
  );

  // Set while a chat about a spreadsheet is starting: its chat is empty until the spreadsheet message
  // lands, and an initChat in that gap would otherwise introduce itself over the same connection.
  let isStartingSpreadsheetChat = false;
  addEffect(initChat, async (_, { dispatch, getState, extra: { aiChatService } }) => {
    if (isStartingSpreadsheetChat) {
      return;
    }
    const spreadsheet = getState().aiPlanner.pendingSpreadsheet;
    if (spreadsheet) {
      isStartingSpreadsheetChat = true;
      dispatch(clearPendingSpreadsheet());
      try {
        // Not the restartChat action: its introduction would stream alongside the reply to the
        // spreadsheet. The spreadsheet message states the locale and weight unit the introduction sends.
        await aiChatService.restartChat();
        dispatch(setChat([]));
        dispatch(
          addMessage({
            from: 'User',
            id: uuid(),
            type: 'sharedSpreadsheet',
            fileName: spreadsheet.fileName,
            sheets: spreadsheet.sheets,
          }),
        );
      } finally {
        isStartingSpreadsheetChat = false;
      }
      return;
    }
    if (getState().aiPlanner.plannerChat.length) {
      return;
    }
    dispatch(restartChat());
  });

  addEffect(restartChat, async (_, { dispatch, extra: { aiChatService } }) => {
    await aiChatService.restartChat();
    const originalMessage: ChatMessage = {
      from: 'Agent',
      id: uuid(),
      message: '',
      type: 'messageResponse',
      isLoading: true,
    };
    dispatch(addMessage(originalMessage));
    let latestMessage: AiChatResponseV2 | undefined = undefined;
    for await (const chatResponse of aiChatService.introduce()) {
      latestMessage = chatResponse;
      dispatch(
        updateMessage({
          id: originalMessage.id,
          from: 'Agent',
          isLoading: true,
          ...chatResponse,
        }),
      );
    }

    dispatch(
      updateMessage({
        id: originalMessage.id,
        from: 'Agent',
        ...(latestMessage ?? originalMessage),
        isLoading: false,
      }),
    );
  });
}
