import { create } from 'zustand';

export interface StreamSession {
  cameraId: string;
  cameraName: string;
  productId: number;
  productName: string;
  startedAt: string;
  youtubeUrl: string;
}

export type StreamSessionState = {
  activeStream: StreamSession | null;
  setActiveStream: (session: StreamSession | null) => void;
};

/** The live stream this app session started, shared by the banner, camera and product screens. */
export const useStreamSession = create<StreamSessionState>()((set) => ({
  activeStream: null,
  setActiveStream: (activeStream) => set({ activeStream }),
}));
