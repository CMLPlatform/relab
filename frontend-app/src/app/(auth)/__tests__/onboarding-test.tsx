import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
import { useRouter } from 'expo-router';
import Onboarding from '../onboarding';
import { DialogProvider } from '@/components/common/DialogProvider';
import * as auth from '@/services/api/authentication';

jest.mock('@/services/api/authentication', () => ({
  updateUser: jest.fn(),
}));

const mockReplace = jest.fn();

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <PaperProvider>
      <DialogProvider>{children}</DialogProvider>
    </PaperProvider>
  );
}

describe('Onboarding screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue({
      push: jest.fn(),
      replace: mockReplace,
      back: jest.fn(),
      setParams: jest.fn(),
    });
  });

  it('renders the Welcome text and Continue button', () => {
    render(
      <Wrapper>
        <Onboarding />
      </Wrapper>,
    );
    expect(screen.getByText('Welcome!')).toBeTruthy();
    expect(screen.getByText('Continue')).toBeTruthy();
  });

  it('shows dialog when username is too short', async () => {
    render(
      <Wrapper>
        <Onboarding />
      </Wrapper>,
    );
    const input = screen.UNSAFE_getAllByType(require('react-native').TextInput)[0];
    fireEvent.changeText(input, 'a');
    fireEvent.press(screen.getByText('Continue'));
    await waitFor(() => {
      expect(screen.getByText('Invalid Username')).toBeTruthy();
    });
  });

  it('calls updateUser with username on valid submit', async () => {
    (auth.updateUser as jest.Mock).mockResolvedValue({ username: 'newuser' });
    render(
      <Wrapper>
        <Onboarding />
      </Wrapper>,
    );
    const input = screen.UNSAFE_getAllByType(require('react-native').TextInput)[0];
    fireEvent.changeText(input, 'newuser');
    fireEvent.press(screen.getByText('Continue'));
    await waitFor(() => {
      expect(auth.updateUser).toHaveBeenCalledWith({ username: 'newuser' });
    });
  });

  it('redirects to products on successful username save', async () => {
    (auth.updateUser as jest.Mock).mockResolvedValue({ username: 'newuser' });
    render(
      <Wrapper>
        <Onboarding />
      </Wrapper>,
    );
    const input = screen.UNSAFE_getAllByType(require('react-native').TextInput)[0];
    fireEvent.changeText(input, 'newuser');
    fireEvent.press(screen.getByText('Continue'));
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith(expect.objectContaining({ pathname: '/products' }));
    });
  });

  it('shows error dialog when updateUser throws', async () => {
    (auth.updateUser as jest.Mock).mockRejectedValue(new Error('Username taken'));
    render(
      <Wrapper>
        <Onboarding />
      </Wrapper>,
    );
    const input = screen.UNSAFE_getAllByType(require('react-native').TextInput)[0];
    fireEvent.changeText(input, 'takenname');
    fireEvent.press(screen.getByText('Continue'));
    await waitFor(() => {
      expect(screen.getByText('Error')).toBeTruthy();
    });
  });
});
