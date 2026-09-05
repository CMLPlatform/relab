import { useCallback, useReducer, useState } from 'react';
import type { YouTubePrivacyStatus } from '@/services/api/rpiCamera';

export type StreamDialogState = {
  cameraId: string | null;
  cameraName: string;
  title: string;
  privacy: YouTubePrivacyStatus;
};

type StreamDialogAction =
  | { type: 'open'; cameraId: string; cameraName: string; defaultTitle: string }
  | { type: 'close' }
  | { type: 'set_title'; value: string }
  | { type: 'set_privacy'; value: YouTubePrivacyStatus };

const STREAM_DIALOG_INITIAL: StreamDialogState = {
  cameraId: null,
  cameraName: '',
  title: '',
  privacy: 'private',
};

function streamDialogReducer(
  state: StreamDialogState,
  action: StreamDialogAction,
): StreamDialogState {
  switch (action.type) {
    case 'open':
      return {
        cameraId: action.cameraId,
        cameraName: action.cameraName,
        title: action.defaultTitle,
        privacy: 'private',
      };
    case 'close':
      return STREAM_DIALOG_INITIAL;
    case 'set_title':
      return { ...state, title: action.value };
    case 'set_privacy':
      return { ...state, privacy: action.value };
  }
}

export function useCameraStreamingController() {
  const [streamDialog, dispatchStreamDialog] = useReducer(
    streamDialogReducer,
    STREAM_DIALOG_INITIAL,
  );
  const [isStartingStream, setIsStartingStream] = useState(false);

  return {
    streamDialog,
    isStartingStream,
    setIsStartingStream,
    openStreamDialog: (cameraId: string, cameraName: string, defaultTitle: string) =>
      dispatchStreamDialog({ type: 'open', cameraId, cameraName, defaultTitle }),
    closeStreamDialog: () => dispatchStreamDialog({ type: 'close' }),
    setStreamTitle: (value: string) => dispatchStreamDialog({ type: 'set_title', value }),
    setStreamPrivacy: (value: YouTubePrivacyStatus) =>
      dispatchStreamDialog({ type: 'set_privacy', value }),
  };
}

export function useCameraSelectionController() {
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  const clearSelection = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }, []);

  const enterSelectionMode = useCallback((initialId?: string) => {
    setSelectionMode(true);
    if (initialId) setSelectedIds(new Set([initialId]));
  }, []);

  const toggleSelected = useCallback((cameraId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(cameraId)) {
        next.delete(cameraId);
      } else {
        next.add(cameraId);
      }
      return next;
    });
  }, []);

  // Drop ids for cameras that have left the list (e.g. unpaired/removed on refetch)
  // so "Capture N" and the selection count never count ghosts.
  const retainSelected = useCallback((validIds: Set<string>) => {
    setSelectedIds((prev) => {
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (validIds.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, []);

  const selectAll = useCallback((ids: string[]) => setSelectedIds(new Set(ids)), []);

  return {
    selectionMode,
    selectedIds,
    selectedCount: selectedIds.size,
    clearSelection,
    enterSelectionMode,
    toggleSelected,
    retainSelected,
    selectAll,
  };
}
