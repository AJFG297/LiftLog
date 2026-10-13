import { AiChatResponseV2 } from '@/models/ai-models';
import { aiPlannerReducer, ChatMessage, convertSpreadsheetWithAi, initChat, restartChat } from '@/store/ai-planner';
import { applyAiPlannerEffects } from '@/store/ai-planner/effects';
import { settingsReducer } from '@/store/settings';
import { createAddEffectTestBed } from '@/utils/__test__/add-effect-testbed';
import { combineReducers } from '@reduxjs/toolkit';
import { describe, expect, it, vi } from 'vitest';

const sheets = [{ name: 'Week 1', rows: [['Squat', '5x5', '75%']] }];
const oldMessage: ChatMessage = { id: 'old', from: 'Agent', type: 'messageResponse', message: 'Earlier chat' };
const reply: AiChatResponseV2 = { type: 'messageResponse', message: 'Here is your plan' };

function makeTestBed() {
  const sendMessage = vi.fn(async function* (_message: string) {
    yield reply;
  });
  const aiChatService = { restartChat: vi.fn(() => Promise.resolve()), introduce: vi.fn(), sendMessage };
  const testBed = createAddEffectTestBed({
    reducer: combineReducers({ aiPlanner: aiPlannerReducer, settings: settingsReducer }),
    initialState: { aiPlanner: { plannerChat: [oldMessage] }, settings: { useImperialUnits: true } },
    services: { aiChatService },
    runDispatchedEffects: true,
  });
  applyAiPlannerEffects(testBed.addEffect);
  return { testBed, aiChatService };
}

describe('converting a spreadsheet with AI', () => {
  it('starts a new chat whose only message out is the spreadsheet', async () => {
    const { testBed, aiChatService } = makeTestBed();

    await testBed.dispatchHandled(convertSpreadsheetWithAi({ fileName: 'Program.xlsx', sheets }));
    await testBed.dispatchHandled(initChat());

    expect(aiChatService.restartChat).toHaveBeenCalledTimes(1);
    expect(aiChatService.introduce).not.toHaveBeenCalled();
    testBed.expectNotDispatched(restartChat);
    expect(aiChatService.sendMessage).toHaveBeenCalledTimes(1);
    const wireMessage = aiChatService.sendMessage.mock.calls[0]![0];
    expect(wireMessage).toContain('"Program.xlsx"');
    expect(wireMessage).toContain('My preferred weight unit is pounds.');
    expect(wireMessage).toContain('## Sheet: Week 1\nSquat,5x5,75%');

    const chat = testBed.getState().aiPlanner.plannerChat;
    // Newest first, as the planner's inverted list shows it.
    expect(chat).toEqual([
      { id: chat[0]!.id, from: 'Agent', isLoading: false, ...reply },
      { id: chat[1]!.id, from: 'User', type: 'sharedSpreadsheet', fileName: 'Program.xlsx', sheets },
    ]);
    expect(testBed.getState().aiPlanner.pendingSpreadsheet).toBeUndefined();
  });

  it('does not send the spreadsheet again when the planner opens later', async () => {
    const { testBed, aiChatService } = makeTestBed();
    await testBed.dispatchHandled(convertSpreadsheetWithAi({ fileName: 'Program.xlsx', sheets }));
    await testBed.dispatchHandled(initChat());
    const chat = testBed.getState().aiPlanner.plannerChat;

    await testBed.dispatchHandled(initChat());

    expect(aiChatService.sendMessage).toHaveBeenCalledTimes(1);
    expect(aiChatService.restartChat).toHaveBeenCalledTimes(1);
    expect(testBed.getState().aiPlanner.plannerChat).toBe(chat);
  });

  it('ignores a second initChat that arrives while the spreadsheet chat is starting', async () => {
    const { testBed, aiChatService } = makeTestBed();
    testBed.setState({ aiPlanner: { isHydrated: true, plannerChat: [] } });
    await testBed.dispatchHandled(convertSpreadsheetWithAi({ fileName: 'Program.xlsx', sheets }));

    await Promise.all([testBed.dispatchHandled(initChat()), testBed.dispatchHandled(initChat())]);

    testBed.expectNotDispatched(restartChat);
    expect(aiChatService.introduce).not.toHaveBeenCalled();
    expect(aiChatService.sendMessage).toHaveBeenCalledTimes(1);
  });
});
