import React, { createContext, useState, useContext, useRef } from 'react';

const NotificationContext = createContext(null);

export const NotificationProvider = ({ children }) => {
  const [notifications, setNotifications] = useState([]);
  const lastNotificationRef = useRef(new Map());

  const addNotification = (message, type = 'info', duration = 5000, action = null) => {
    const normalizedMessage = String(message || '').trim();
    const dedupeKey = `${type}::${normalizedMessage}`;
    const now = Date.now();
    const lastAt = lastNotificationRef.current.get(dedupeKey) || 0;

    // Evita cards duplicados em sequência (ex.: StrictMode/effects duplicados).
    if (now - lastAt < 1800) {
      return null;
    }

    lastNotificationRef.current.set(dedupeKey, now);

    const id = Date.now() + Math.random();
    const notification = { id, message: normalizedMessage, type, duration, action };

    setNotifications(prev => {
      const jaExisteAtiva = prev.some((n) => n.type === type && String(n.message || '').trim() === normalizedMessage);
      if (jaExisteAtiva) return prev;
      return [...prev, notification];
    });

    if (duration > 0) {
      setTimeout(() => {
        removeNotification(id);
      }, duration);
    }

    return id;
  };

  const removeNotification = (id) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const success = (message, duration) => addNotification(message, 'success', duration);
  const error = (message, duration) => addNotification(message, 'error', duration);
  const warning = (message, duration) => addNotification(message, 'warning', duration);
  const info = (message, duration) => addNotification(message, 'info', duration);

  const actionNotify = (message, actionLabel, onAction, type = 'info', duration = 7000) => {
    return addNotification(message, type, duration, { label: actionLabel, onClick: onAction });
  };

  return (
    <NotificationContext.Provider value={{
      notifications,
      addNotification,
      removeNotification,
      success,
      error,
      warning,
      info,
      actionNotify
    }}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotification = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification must be used within NotificationProvider');
  }
  return context;
};