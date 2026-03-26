import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import NetInfo from '@react-native-community/netinfo';
import {
  getQueue,
  removeFromQueue,
} from '../utils/offlineQueue';
import * as api from '../services/api';

// ─── Handlers para sync de ações offline ─────────────────────────────────────
const ACTION_HANDLERS: Record<string, (payload: unknown) => Promise<unknown>> = {
  CREATE_RDO: (p) => api.createRDO(p as Record<string, unknown>),
  CREATE_RNC: (p) => api.createRNC(p as Record<string, unknown>),
  UPDATE_STATUS_RDO: (p) => {
    const { id, status } = p as { id: number; status: string };
    return api.updateStatusRDO(id, status);
  },
  UPDATE_STATUS_RNC: (p) => {
    const { id, status } = p as { id: number; status: string };
    return api.updateStatusRNC(id, status);
  },
};

// ─── Context ──────────────────────────────────────────────────────────────────
interface NetworkContextType {
  isOnline: boolean;
  pendingCount: number;
  isSyncing: boolean;
  syncNow: () => Promise<void>;
}

const NetworkContext = createContext<NetworkContextType>({
  isOnline: true,
  pendingCount: 0,
  isSyncing: false,
  syncNow: async () => {},
});

export function NetworkProvider({ children }: { children: React.ReactNode }) {
  const [isOnline, setIsOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const syncingRef = useRef(false);

  const refreshCount = useCallback(async () => {
    const q = await getQueue();
    setPendingCount(q.length);
  }, []);

  const syncNow = useCallback(async () => {
    if (syncingRef.current) return;
    const queue = await getQueue();
    if (queue.length === 0) return;

    syncingRef.current = true;
    setIsSyncing(true);

    for (const action of queue) {
      const handler = ACTION_HANDLERS[action.type];
      if (handler) {
        try {
          await handler(action.payload);
          await removeFromQueue(action.id);
        } catch {
          // mantém na fila se falhar
        }
      } else {
        // tipo desconhecido — remove para não bloquear
        await removeFromQueue(action.id);
      }
    }

    syncingRef.current = false;
    setIsSyncing(false);
    await refreshCount();
  }, [refreshCount]);

  useEffect(() => {
    refreshCount();

    const unsubscribe = NetInfo.addEventListener((state) => {
      const connected =
        Boolean(state.isConnected) &&
        state.isInternetReachable !== false;
      setIsOnline(connected);
      if (connected) {
        // reconectou → dispara sync
        syncNow();
      }
    });

    return () => unsubscribe();
  }, [syncNow, refreshCount]);

  return (
    <NetworkContext.Provider
      value={{ isOnline, pendingCount, isSyncing, syncNow }}
    >
      {children}
    </NetworkContext.Provider>
  );
}

export function useNetwork() {
  return useContext(NetworkContext);
}
