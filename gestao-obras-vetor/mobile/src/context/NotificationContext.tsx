import React, {
  createContext,
  useState,
  useContext,
  useCallback,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  TouchableOpacity,
} from 'react-native';
import { CORES } from '../utils/constants';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface NotificationContextType {
  success: (msg: string) => void;
  error: (msg: string) => void;
  warning: (msg: string) => void;
  info: (msg: string) => void;
}

const NotificationContext = createContext<NotificationContextType | null>(null);

const TOAST_COLORS: Record<ToastType, { bg: string; text: string }> = {
  success: { bg: CORES.sucesso, text: '#FFF' },
  error: { bg: CORES.erro, text: '#FFF' },
  warning: { bg: CORES.secundaria, text: '#FFF' },
  info: { bg: CORES.primaria, text: '#FFF' },
};

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: (id: string) => void;
}) {
  const colors = TOAST_COLORS[toast.type];
  return (
    <TouchableOpacity
      onPress={() => onDismiss(toast.id)}
      style={[styles.toast, { backgroundColor: colors.bg }]}
      activeOpacity={0.9}
    >
      <Text style={[styles.toastText, { color: colors.text }]}>
        {toast.message}
      </Text>
    </TouchableOpacity>
  );
}

export function NotificationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((message: string, type: ToastType) => {
    const id = Date.now().toString();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const success = useCallback(
    (msg: string) => addToast(msg, 'success'),
    [addToast],
  );
  const error = useCallback(
    (msg: string) => addToast(msg, 'error'),
    [addToast],
  );
  const warning = useCallback(
    (msg: string) => addToast(msg, 'warning'),
    [addToast],
  );
  const info = useCallback(
    (msg: string) => addToast(msg, 'info'),
    [addToast],
  );

  return (
    <NotificationContext.Provider value={{ success, error, warning, info }}>
      {children}
      <View style={styles.container} pointerEvents="box-none">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
        ))}
      </View>
    </NotificationContext.Provider>
  );
}

export function useNotification(): NotificationContextType {
  const ctx = useContext(NotificationContext);
  if (!ctx)
    throw new Error('useNotification must be used within NotificationProvider');
  return ctx;
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 80,
    left: 16,
    right: 16,
    zIndex: 9999,
    gap: 8,
  },
  toast: {
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 6,
  },
  toastText: {
    fontSize: 14,
    fontWeight: '500',
  },
});
