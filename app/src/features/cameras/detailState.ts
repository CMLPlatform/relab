import { useState } from 'react';
import type { CameraConnectionInfo } from '@/features/cameras/local-connection/useLocalConnection';

export function useCameraDetailDialogs(localConnection: CameraConnectionInfo) {
  const [deleteVisible, setDeleteVisible] = useState(false);
  const [localSetupVisible, setLocalSetupVisible] = useState(false);
  const [localUrlInput, setLocalUrlInput] = useState('');
  const [localKeyInput, setLocalKeyInput] = useState('');
  const [localSetupSaving, setLocalSetupSaving] = useState(false);
  const [previewEnabled, setPreviewEnabled] = useState(false);

  return {
    preview: {
      enabled: previewEnabled,
    },
    dialogs: {
      deleteVisible,
      localSetupVisible,
      localUrlInput,
      localKeyInput,
      localSetupSaving,
    },
    actions: {
      requestDelete: () => setDeleteVisible(true),
      closeDelete: () => setDeleteVisible(false),
      openManualSetup: () => {
        setLocalUrlInput(localConnection.localBaseUrl ?? '');
        setLocalKeyInput('');
        setLocalSetupVisible(true);
      },
      closeManualSetup: () => setLocalSetupVisible(false),
      setLocalUrl: setLocalUrlInput,
      setLocalKey: setLocalKeyInput,
      setLocalSetupSaving,
      togglePreview: () => setPreviewEnabled((enabled) => !enabled),
    },
  };
}
