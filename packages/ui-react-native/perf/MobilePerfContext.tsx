import React, { createContext, useContext } from 'react';
import type { PropsWithChildren } from 'react';
import { createPerfSession, type PerfSession, type PerfSessionContext } from './perfSession';

const disabledSession = createPerfSession({ enabled: false, context: { fixture: 'unknown' } });
const MobilePerfContext = createContext<PerfSession>(disabledSession);

export function MobilePerfProvider({ session, context, children }: PropsWithChildren<{ session?: PerfSession; context?: PerfSessionContext }>) {
  const value = session ?? (context ? createPerfSession({ enabled: true, context }) : disabledSession);
  return <MobilePerfContext.Provider value={value}>{children}</MobilePerfContext.Provider>;
}

export function useMobilePerf(): PerfSession {
  return useContext(MobilePerfContext);
}
