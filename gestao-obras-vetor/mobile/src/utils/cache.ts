import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFIX = '@vetor_cache:';
const DEFAULT_TTL = 24 * 60 * 60 * 1000; // 24 horas

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

/** Lê um valor do cache. Retorna null se não existir ou estiver expirado. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function cacheGet<T = any>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const entry: CacheEntry<T> = JSON.parse(raw);
    if (Date.now() > entry.expiresAt) {
      await AsyncStorage.removeItem(PREFIX + key);
      return null;
    }
    return entry.data;
  } catch {
    return null;
  }
}

/** Salva um valor no cache com TTL (padrão 24h). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function cacheSet<T = any>(
  key: string,
  data: T,
  ttlMs = DEFAULT_TTL,
): Promise<void> {
  try {
    const entry: CacheEntry<T> = { data, expiresAt: Date.now() + ttlMs };
    await AsyncStorage.setItem(PREFIX + key, JSON.stringify(entry));
  } catch {
    // falha silenciosa — cache não é crítico
  }
}

/**
 * Tenta executar `fetcher`. Se der certo, salva o resultado no cache.
 * Se der erro de rede (sem `error.response`), retorna cache existente.
 * Caso não haja cache e a rede falhou, re-lança o erro.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function withCache(
  key: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fetcher: () => Promise<{ data: any }>,
  ttlMs = DEFAULT_TTL,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<{ data: any; fromCache?: boolean }> {
  try {
    const result = await fetcher();
    // sucesso → persiste no cache em background, não bloqueia
    cacheSet(key, result.data, ttlMs).catch(() => {});
    return result;
  } catch (err: unknown) {
    const isNetworkErr =
      !!(err && typeof err === 'object' && !('response' in err && (err as Record<string, unknown>).response));
    if (isNetworkErr) {
      const cached = await cacheGet(key);
      if (cached !== null) {
        return { data: cached, fromCache: true };
      }
    }
    throw err;
  }
}

/** Remove uma entrada específica do cache. */
export async function cacheInvalidate(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(PREFIX + key);
  } catch {}
}
