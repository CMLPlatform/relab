import { type ReactNode, useMemo, useState } from 'react';
import { type StreamSession, StreamSessionContext } from './streamSession';

export function StreamSessionProvider({ children }: { children: ReactNode }) {
  const [activeStream, setActiveStream] = useState<StreamSession | null>(null);

  const value = useMemo(() => ({ activeStream, setActiveStream }), [activeStream]);

  return <StreamSessionContext.Provider value={value}>{children}</StreamSessionContext.Provider>;
}
