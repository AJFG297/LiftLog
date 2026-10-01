import AiPlanner from '../../settings/ai/planner';

/**
 * The AI planner, opened from the Routines tab (Build with AI, a new routine's Describe it) so it sits on
 * this tab's stack and Back returns there. You opens the same screen at `/settings/ai/planner`.
 */
export default function RoutinesAiPlanner() {
  return <AiPlanner />;
}
