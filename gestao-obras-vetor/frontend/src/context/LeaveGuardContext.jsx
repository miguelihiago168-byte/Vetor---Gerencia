import React, { createContext, useContext, useState, useEffect } from 'react';

const LeaveGuardContext = createContext({ isDirty: false, setDirty: () => {} });

export const LeaveGuardProvider = ({ children }) => {
  const [isDirty, setDirty] = useState(false);

  useEffect(() => {
    const handler = (e) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  return (
    <LeaveGuardContext.Provider value={{ isDirty, setDirty }}>
      {children}
    </LeaveGuardContext.Provider>
  );
};

export const useLeaveGuard = () => useContext(LeaveGuardContext);
