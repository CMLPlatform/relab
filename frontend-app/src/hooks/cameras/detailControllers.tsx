import { useState } from 'react';
import type { CameraConnectionInfo } from '@/hooks/useLocalConnection';

export function useCameraDetailDialogs(localConnection: CameraConnectionInfo) {
  const [editNameVisible, setEditNameVisible] = useState(false);
  const [editDescriptionVisible, setEditDescriptionVisible] = useState(false);
  const [deleteVisible, setDeleteVisible] = useState(false);
  const [localSetupVisible, setLocalSetupVisible] = useState(false);
  const [localUrlInput, setLocalUrlInput] = useState('');
  const [localKeyInput, setLocalKeyInput] = useState('');
  const [localSetupSaving, setLocalSetupSaving] = useState(false);
  const [previewEnabled, setPreviewEnabled] = useState(true);

  return {
    preview: {
      enabled: previewEnabled,
    },
    dialogs: {
      editNameVisible,
      editDescriptionVisible,
      deleteVisible,
      localSetupVisible,
      localUrlInput,
      localKeyInput,
      localSetupSaving,
    },
    actions: {
      openEditName: () => setEditNameVisible(true),
      closeEditName: () => setEditNameVisible(false),
      openEditDescription: () => setEditDescriptionVisible(true),
      closeEditDescription: () => setEditDescriptionVisible(false),
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
