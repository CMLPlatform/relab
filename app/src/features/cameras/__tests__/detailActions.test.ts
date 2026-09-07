import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { DialogButton, DialogOptions } from '@/components/base/dialogContext';
import { createCameraDetailActions } from '@/features/cameras/detailActions';

/** The Save button (index 1) of the most recent feedback.input() call. */
function lastInputSaveButton(input: jest.Mock<(options: DialogOptions) => void>): DialogButton {
  const button = input.mock.calls.at(-1)?.[0]?.buttons?.[1];
  if (!button) throw new Error('No Save button on the last input dialog');
  return button;
}

function isDisabled(button: DialogButton, value: string): boolean {
  return typeof button.disabled === 'function' ? button.disabled(value) : Boolean(button.disabled);
}

describe('camera detail actions', () => {
  const refetch = jest.fn();
  const replace = jest.fn();
  const alert = jest.fn();
  const configure = jest.fn<() => Promise<void>>();
  const clearLocalConnection = jest.fn<() => Promise<void> | undefined>();
  const input = jest.fn<(options: DialogOptions) => void>();
  const closeManualSetup = jest.fn();
  const setLocalSetupSaving = jest.fn();
  const updateMutate =
    jest.fn<
      (
        data: { name?: string; description?: string | null },
        options?: { onSuccess?: () => void; onError?: (error: unknown) => void },
      ) => void
    >();
  const deleteMutate =
    jest.fn<
      (id: string, options?: { onSuccess?: () => void; onError?: (error: unknown) => void }) => void
    >();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function makeActions(overrides: Partial<Parameters<typeof createCameraDetailActions>[0]> = {}) {
    return createCameraDetailActions({
      camera: { id: 'camera-1', name: 'Workbench Camera', description: 'Bench setup' },
      refetch,
      router: { replace },
      feedback: { alert, input },
      localConnection: { configure, clearLocalConnection },
      dialogs: {
        localUrlInput: ' https://camera.local ',
        localKeyInput: ' secret-key ',
      },
      dialogActions: {
        closeManualSetup,
        setLocalSetupSaving,
      },
      updateMutation: { isPending: false, mutate: updateMutate },
      deleteMutation: { isPending: false, mutate: deleteMutate },
      ...overrides,
    });
  }

  it('opens the rename prompt seeded with the current name and gates Save on length', () => {
    const actions = makeActions();

    actions.promptRename();

    expect(input.mock.calls[0]?.[0]).toMatchObject({
      title: 'Edit name',
      defaultValue: 'Workbench Camera',
    });
    const saveButton = lastInputSaveButton(input);
    expect(isDisabled(saveButton, 'a')).toBe(true); // below the 2-char floor
    expect(isDisabled(saveButton, 'a'.repeat(101))).toBe(true); // above the 100-char ceiling
    expect(isDisabled(saveButton, 'Studio Camera')).toBe(false);

    saveButton.onPress?.('  Studio Camera  ');

    expect(updateMutate).toHaveBeenCalledWith(
      { name: 'Studio Camera' },
      expect.objectContaining({ onError: expect.any(Function) }),
    );
  });

  it('opens the description prompt seeded with the current description and gates Save at 500 chars', () => {
    const actions = makeActions();

    actions.promptEditDescription();

    expect(input.mock.calls[0]?.[0]).toMatchObject({
      title: 'Edit description',
      defaultValue: 'Bench setup',
    });
    const saveButton = lastInputSaveButton(input);
    expect(isDisabled(saveButton, 'a'.repeat(501))).toBe(true);
    expect(isDisabled(saveButton, 'a'.repeat(500))).toBe(false);

    saveButton.onPress?.('  ');

    expect(updateMutate).toHaveBeenCalledWith(
      { description: null },
      expect.objectContaining({ onError: expect.any(Function) }),
    );
  });

  it('surfaces mutation failures via feedback.alert', () => {
    const actions = makeActions();

    actions.promptRename();
    lastInputSaveButton(input).onPress?.('Studio Camera');

    const saveErrorHandler = updateMutate.mock.calls[0]?.[1]?.onError as (error: unknown) => void;
    saveErrorHandler(new Error('save broke'));

    expect(alert).toHaveBeenCalledWith({
      title: 'Save failed',
      message: 'Error: save broke',
      buttons: [{ text: 'OK' }],
    });
  });

  it('wires delete actions to navigation and delete-failed feedback', () => {
    const actions = makeActions();

    actions.deleteCamera();

    expect(deleteMutate).toHaveBeenCalledWith(
      'camera-1',
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    );

    const deleteSuccess = deleteMutate.mock.calls[0]?.[1]?.onSuccess as () => void;
    const deleteError = deleteMutate.mock.calls[0]?.[1]?.onError as (error: unknown) => void;

    deleteSuccess();
    deleteError('cannot delete');

    expect(replace).toHaveBeenCalledWith('/cameras');
    expect(alert).toHaveBeenCalledWith({
      title: 'Delete failed',
      message: 'cannot delete',
      buttons: [{ text: 'OK' }],
    });
  });

  it('handles refresh, disconnect, and local connection setup', async () => {
    configure.mockResolvedValueOnce(undefined);
    const actions = makeActions();

    actions.refresh();
    actions.disconnectLocal();
    await actions.connectLocal();

    expect(refetch).toHaveBeenCalled();
    expect(clearLocalConnection).toHaveBeenCalled();
    expect(configure).toHaveBeenCalledWith('https://camera.local', 'secret-key');
    expect(setLocalSetupSaving).toHaveBeenNthCalledWith(1, true);
    expect(closeManualSetup).toHaveBeenCalled();
    expect(setLocalSetupSaving).toHaveBeenLastCalledWith(false);
  });

  it('always clears local setup saving even when local configuration fails', async () => {
    configure.mockRejectedValueOnce(new Error('probe failed'));
    const actions = makeActions();

    await actions.connectLocal();

    expect(closeManualSetup).not.toHaveBeenCalled();
    expect(setLocalSetupSaving).toHaveBeenNthCalledWith(1, true);
    expect(setLocalSetupSaving).toHaveBeenLastCalledWith(false);
  });

  it('skips delete mutation when no camera is loaded', () => {
    const actions = makeActions({ camera: null });

    actions.deleteCamera();

    expect(deleteMutate).not.toHaveBeenCalled();
  });
});
