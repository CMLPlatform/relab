import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

export interface StreamSession {
  cameraId: string;
  cameraName: string;
  productId: number;
  productName: string;
  startedAt: string;
  youtubeUrl: string;
}

interface StreamSessionContextValue {
  activeStream: StreamSession | null;
  setActiveStream: (session: StreamSession | null) => void;
}

const StreamSessionContext = createContext<StreamSessionContextValue>({
  activeStream: null,
  setActiveStream: () => {},
});

export function StreamSessionProvider({ children }: { children: ReactNode }) {
  const [activeStream, setActiveStreamState] = useState<StreamSession | null>(null);

  const setActiveStream = useCallback((session: StreamSession | null) => {
    setActiveStreamState(session);
  }, []);

  return (
    <StreamSessionContext.Provider value={{ activeStream, setActiveStream }}>
      {children}
    </StreamSessionContext.Provider>
  );
}

export function useStreamSession() {
  return useContext(StreamSessionContext);
}
