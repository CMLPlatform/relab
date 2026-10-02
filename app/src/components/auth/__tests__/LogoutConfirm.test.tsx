import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { onlineManager, useMutation } from '@tanstack/react-query';
import { act, screen } from '@testing-library/react-native';
import { useEffect } from 'react';
import LogoutConfirm from '@/components/auth/LogoutConfirm';
import { renderWithProviders, setupUser } from '@/test-utils/index';

describe('LogoutConfirm', () => {
  const user = setupUser();

  it('renders the logout dialog when visible', async () => {
    await renderWithProviders(
      <LogoutConfirm visible onDismiss={jest.fn()} onConfirm={jest.fn()} />,
      {
        withDialog: true,
      },
    );
    expect(screen.getAllByText('Sign out').length).toBeGreaterThan(0);
    expect(screen.getByText('Are you sure you want to sign out?')).toBeOnTheScreen();
  });

  it('does not render dialog content when not visible', async () => {
    await renderWithProviders(
      <LogoutConfirm visible={false} onDismiss={jest.fn()} onConfirm={jest.fn()} />,
      {
        withDialog: true,
      },
    );
    expect(screen.queryByText('Are you sure you want to sign out?')).toBeNull();
  });

  it('calls onDismiss when Cancel is pressed', async () => {
    const onDismiss = jest.fn();
    await renderWithProviders(
      <LogoutConfirm visible onDismiss={onDismiss} onConfirm={jest.fn()} />,
      {
        withDialog: true,
      },
    );
    await user.press(screen.getByText('Cancel'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('calls onConfirm when Logout button is pressed', async () => {
    const onConfirm = jest.fn();
    await renderWithProviders(
      <LogoutConfirm visible onDismiss={jest.fn()} onConfirm={onConfirm} />,
      {
        withDialog: true,
      },
    );
    const items = screen.getAllByText('Sign out');
    await user.press(items[items.length - 1]);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  describe('with items still waiting to send', () => {
    afterEach(async () => {
      await act(() => onlineManager.setOnline(true));
    });

    // Sign-out clears the query client, paused mutations included.
    function QueuedItem() {
      const { mutate } = useMutation({ mutationFn: () => new Promise<void>(() => {}) });
      useEffect(() => mutate(), [mutate]);
      return null;
    }

    it('warns that signing out discards them', async () => {
      await act(() => onlineManager.setOnline(false));
      await renderWithProviders(
        <>
          <QueuedItem />
          <QueuedItem />
          <LogoutConfirm visible onDismiss={jest.fn()} onConfirm={jest.fn()} />
        </>,
        { withDialog: true },
      );

      expect(
        await screen.findByText(
          '2 items are still waiting to send. Signing out now discards them.',
        ),
      ).toBeOnTheScreen();
      expect(screen.getByText('Sign out anyway')).toBeOnTheScreen();
      expect(screen.getByText('Cancel')).toBeOnTheScreen();
    });
  });
});
