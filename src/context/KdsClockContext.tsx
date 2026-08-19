'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';

interface KdsClockContextValue {
  now: Date;
}

const KdsClockContext = createContext<KdsClockContextValue>({
  now: new Date(),
});

export const KdsClockProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    // Single shared timer ticking every 30 seconds for the entire KDS dashboard
    const interval = setInterval(() => {
      setNow(new Date());
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  return <KdsClockContext.Provider value={{ now }}>{children}</KdsClockContext.Provider>;
};

export const useKdsClock = (): Date => {
  const ctx = useContext(KdsClockContext);
  return ctx.now;
};
