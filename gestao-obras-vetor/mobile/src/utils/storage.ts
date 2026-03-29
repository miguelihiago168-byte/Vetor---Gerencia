import * as SecureStore from 'expo-secure-store';
import { APP_VERSION } from './constants';

const KEYS = {
  token: 'vetor_token',
  usuario: 'vetor_usuario',
  appVersion: 'vetor_app_version',
};

export const storage = {
  getToken: async (): Promise<string | null> => {
    return SecureStore.getItemAsync(KEYS.token);
  },

  setToken: async (token: string): Promise<void> => {
    await SecureStore.setItemAsync(KEYS.token, token);
  },

  removeToken: async (): Promise<void> => {
    await SecureStore.deleteItemAsync(KEYS.token);
  },

  getUsuario: async (): Promise<Record<string, unknown> | null> => {
    const raw = await SecureStore.getItemAsync(KEYS.usuario);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },

  setUsuario: async (usuario: Record<string, unknown>): Promise<void> => {
    await SecureStore.setItemAsync(KEYS.usuario, JSON.stringify(usuario));
  },

  removeUsuario: async (): Promise<void> => {
    await SecureStore.deleteItemAsync(KEYS.usuario);
  },

  getAppVersion: async (): Promise<string | null> => {
    return SecureStore.getItemAsync(KEYS.appVersion);
  },

  setAppVersion: async (): Promise<void> => {
    await SecureStore.setItemAsync(KEYS.appVersion, APP_VERSION);
  },

  clearAll: async (): Promise<void> => {
    await Promise.all([
      SecureStore.deleteItemAsync(KEYS.token),
      SecureStore.deleteItemAsync(KEYS.usuario),
    ]);
  },
};
