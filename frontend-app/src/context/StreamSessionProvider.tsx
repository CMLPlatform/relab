import { type ReactNode, useCallback, useMemo, useState } from 'react';
import { type StreamSession, StreamSessionContext } from '@/context/streamSession';

export function StreamSessionProvider({ children }: { children: ReactNode }) {
  const [activeStream, setActiveStreamState] = useState<StreamSession | null>(null);

  const setActiveStream = useCallback((session: StreamSession | null) => {
    setActiveStreamState(session);
  }, []);

  const value = useMemo(() => ({ activeStream, setActiveStream }), [activeStream, setActiveStream]);

  return <StreamSessionContext.Provider value={value}>{children}</StreamSessionContext.Provider>;
}
