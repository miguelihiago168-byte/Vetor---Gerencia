import AsyncStorage from '@react-native-async-storage/async-storage';

const QUEUE_KEY = '@vetor_offline_queue';

export interface QueuedAction {
  id: string;
  type: string;
  payload: unknown;
  timestamp: number;
}

/** Adiciona uma ação à fila de sincronização offline. */
export async function enqueue(
  type: string,
  payload: unknown,
): Promise<string> {
  const id = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const queue = await getQueue();
  queue.push({ id, type, payload, timestamp: Date.now() });
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  return id;
}

/** Retorna todas as ações pendentes. */
export async function getQueue(): Promise<QueuedAction[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/** Remove uma ação da fila após sincronizar com sucesso. */
export async function removeFromQueue(id: string): Promise<void> {
  const queue = await getQueue();
  const filtered = queue.filter((a) => a.id !== id);
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(filtered));
}

/** Conta quantas ações estão pendentes. */
export async function getPendingCount(): Promise<number> {
  const queue = await getQueue();
  return queue.length;
}
