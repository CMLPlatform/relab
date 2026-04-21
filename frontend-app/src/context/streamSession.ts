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

export const StreamSessionContext = createContext<StreamSessionContextValue>({
  activeStream: null,
  setActiveStream: () => {},
});

export function useStreamSession() {
  return useContext(StreamSessionContext);
}
