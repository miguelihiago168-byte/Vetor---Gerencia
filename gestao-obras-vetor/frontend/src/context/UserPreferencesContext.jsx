import React, { createContext, useContext, useState, useEffect } from 'react';

const UserPreferencesContext = createContext();

export function UserPreferencesProvider({ children }) {
  const [prefs, setPrefs] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('userPrefs')) || {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    localStorage.setItem('userPrefs', JSON.stringify(prefs));
  }, [prefs]);

  const setPreference = (key, value) => {
    setPrefs((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <UserPreferencesContext.Provider value={{ prefs, setPreference }}>
      {children}
    </UserPreferencesContext.Provider>
  );
}

export function useUserPreferences() {
  return useContext(UserPreferencesContext);
}
