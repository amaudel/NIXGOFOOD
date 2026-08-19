'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';

interface OperationalClockContextValue {
  now: Date;
}

const OperationalClockContext = createContext<OperationalClockContextValue>({
  now: new Date(),
});

export const OperationalClockProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    // Single shared timer ticking every 30 seconds for the entire Cashier supervision dashboard
    const interval = setInterval(() => {
      setNow(new Date());
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  return (
    <OperationalClockContext.Provider value={{ now }}>
      {children}
    </OperationalClockContext.Provider>
  );
};

export const useOperationalClock = (): Date => {
  const ctx = useContext(OperationalClockContext);
  return ctx.now;
};
