import { describe, expect, it } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import { useCameraDetailDialogs } from '@/hooks/cameras/detailControllers';

describe('camera detail controllers', () => {
  const localConnection = {
    localBaseUrl: 'http://camera.local',
  } as never;

  it('seeds manual setup state from the current local connection', () => {
    const { result } = renderHook(() => useCameraDetailDialogs(localConnection));

    act(() => {
      result.current.actions.setLocalKey('stale-key');
      result.current.actions.openManualSetup();
    });

    expect(result.current.dialogs.localSetupVisible).toBe(true);
    expect(result.current.dialogs.localUrlInput).toBe('http://camera.local');
    expect(result.current.dialogs.localKeyInput).toBe('');
  });

  it('toggles preview state and manages dialog visibility', () => {
    const { result } = renderHook(() => useCameraDetailDialogs(localConnection));

    act(() => {
      result.current.actions.openEditName();
      result.current.actions.openEditDescription();
      result.current.actions.requestDelete();
      result.current.actions.togglePreview();
    });

    expect(result.current.dialogs.editNameVisible).toBe(true);
    expect(result.current.dialogs.editDescriptionVisible).toBe(true);
    expect(result.current.dialogs.deleteVisible).toBe(true);
    expect(result.current.preview.enabled).toBe(false);

    act(() => {
      result.current.actions.closeEditName();
      result.current.actions.closeEditDescription();
      result.current.actions.closeDelete();
      result.current.actions.togglePreview();
    });

    expect(result.current.dialogs.editNameVisible).toBe(false);
    expect(result.current.dialogs.editDescriptionVisible).toBe(false);
    expect(result.current.dialogs.deleteVisible).toBe(false);
    expect(result.current.preview.enabled).toBe(true);
  });

  it('tracks local setup field edits and saving state', () => {
    const { result } = renderHook(() => useCameraDetailDialogs(localConnection));

    act(() => {
      result.current.actions.openManualSetup();
      result.current.actions.setLocalUrl('https://relay.local');
      result.current.actions.setLocalKey('secret-key');
      result.current.actions.setLocalSetupSaving(true);
    });

    expect(result.current.dialogs.localUrlInput).toBe('https://relay.local');
    expect(result.current.dialogs.localKeyInput).toBe('secret-key');
    expect(result.current.dialogs.localSetupSaving).toBe(true);

    act(() => {
      result.current.actions.closeManualSetup();
      result.current.actions.setLocalSetupSaving(false);
    });

    expect(result.current.dialogs.localSetupVisible).toBe(false);
    expect(result.current.dialogs.localSetupSaving).toBe(false);
  });
});
