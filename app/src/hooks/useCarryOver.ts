import { useServices } from '@/components/smart/services-provider';
import type { ProgressionKey } from '@/models/blueprint-models';
import type { CarryOver } from '@/models/session-models/carry-over';
import type { RootState } from '@/store';
import { withCarryOver } from '@/store/stored-sessions';
import { useStore } from 'react-redux';

/**
 * Hands `apply` what exercises of `progressionKeys` entering workout `sessionId` open on, at once or after
 * a read (see {@link withCarryOver}). `apply` must address the workout by id.
 */
export function useCarryOver(): (
  sessionId: string,
  progressionKeys: readonly ProgressionKey[],
  apply: (carryOver: CarryOver) => void,
) => void {
  const store = useStore<RootState>();
  const services = useServices();
  return (sessionId, progressionKeys, apply) => {
    void withCarryOver(store.getState, services, sessionId, progressionKeys, apply);
  };
}
