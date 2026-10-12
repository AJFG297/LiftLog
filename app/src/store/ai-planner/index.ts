import { AiChatResponseV2, AiChatSharedProgramMessage, AiChatSharedSpreadsheetMessage } from '@/models/ai-models';
import type { Sheet } from '@/services/plan-import/sheet';
import { createAction, createSlice, PayloadAction } from '@reduxjs/toolkit';

const initialState: AppState = {
  isHydrated: false,
  plannerChat: [],
};

export type ChatMessage = (AiChatResponseV2 | AiChatSharedProgramMessage | AiChatSharedSpreadsheetMessage) & {
  id: string;
  from: 'User' | 'Agent';
  isLoading?: boolean;
};

export interface PendingSpreadsheet {
  fileName: string;
  sheets: Sheet[];
}

type AppState = {
  isHydrated: boolean;
  plannerChat: ChatMessage[];
  /** A spreadsheet waiting for the planner to open and start a new chat with it. */
  pendingSpreadsheet?: PendingSpreadsheet;
};

const aiPlannerSlice = createSlice({
  name: 'aiPlanner',
  initialState,
  reducers: {
    setIsHydrated(state, action: PayloadAction<boolean>) {
      state.isHydrated = action.payload;
    },
    addMessage(state, action: PayloadAction<ChatMessage>): AppState {
      return {
        ...state,
        plannerChat: [action.payload, ...(state.plannerChat as ChatMessage[])],
      };
    },
    updateMessage(state, action: PayloadAction<ChatMessage>) {
      const messageIndex = state.plannerChat.findIndex((x) => x.id === action.payload.id);
      if (messageIndex !== -1) {
        state.plannerChat[messageIndex] = action.payload;
      }
    },
    removeMessage(state, action: PayloadAction<string>) {
      const existingMessage = state.plannerChat.findIndex((x) => x.id === action.payload);
      if (existingMessage === -1) {
        return;
      }
      state.plannerChat.splice(existingMessage, 1);
    },
    restartChat(state) {
      state.plannerChat = [];
    },
    setChat(state, action: PayloadAction<ChatMessage[]>) {
      state.plannerChat = action.payload;
    },
    convertSpreadsheetWithAi(state, action: PayloadAction<PendingSpreadsheet>) {
      state.pendingSpreadsheet = action.payload;
    },
    clearPendingSpreadsheet(state) {
      state.pendingSpreadsheet = undefined;
    },
  },
  selectors: {
    selectIsLoadingAiPlannerMessage: (s) => s.plannerChat.some((x) => x.isLoading),
  },
});

export const initializeAiPlannerStateSlice = createAction('initializeAiPlannerStateSlice');

export const {
  setIsHydrated,
  addMessage,
  restartChat,
  updateMessage,
  setChat,
  convertSpreadsheetWithAi,
  clearPendingSpreadsheet,
} = aiPlannerSlice.actions;

export const { selectIsLoadingAiPlannerMessage } = aiPlannerSlice.selectors;

export const stopAiGenerator = createAction('stopAiGenerator');
export const initChat = createAction('initChat');

export const aiPlannerReducer = aiPlannerSlice.reducer;
