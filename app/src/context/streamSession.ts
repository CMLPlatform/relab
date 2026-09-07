import { createContext, useContext } from 'react';

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

export const StreamSessionContext = createContext<StreamSessionContextValue | null>(null);

export function useStreamSession() {
  const ctx = useContext(StreamSessionContext);
  if (!ctx) throw new Error('useStreamSession must be used within StreamSessionProvider');
  return ctx;
}
