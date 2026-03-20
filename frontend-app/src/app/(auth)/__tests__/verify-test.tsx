import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
import { useLocalSearchParams, useRouter } from 'expo-router';
import VerifyEmailScreen from '../verify';

global.fetch = jest.fn() as jest.Mock;

function Wrapper({ children }: { children: React.ReactNode }) {
  return <PaperProvider>{children}</PaperProvider>;
}

describe('VerifyEmailScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    (useRouter as jest.Mock).mockReturnValue({
      push: jest.fn(),
      replace: jest.fn(),
      back: jest.fn(),
      setParams: jest.fn(),
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows error when no token is provided', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ token: undefined });
    render(
      <Wrapper>
        <VerifyEmailScreen />
      </Wrapper>,
    );
    await waitFor(() => {
      expect(screen.getByText(/No verification token/)).toBeTruthy();
    });
  });

  it('shows loading indicator on mount when token is present', () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ token: 'valid-token' });
    (global.fetch as jest.Mock).mockImplementation(() => new Promise(() => {}));
    render(
      <Wrapper>
        <VerifyEmailScreen />
      </Wrapper>,
    );
    expect(screen.getByText('Verifying your email...')).toBeTruthy();
  });

  it('shows success message when verification succeeds', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ token: 'valid-token' });
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true });
    render(
      <Wrapper>
        <VerifyEmailScreen />
      </Wrapper>,
    );
    await waitFor(() => {
      expect(screen.getByText(/Email verified successfully/)).toBeTruthy();
    });
  });

  it('shows API error when verification returns non-ok response', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ token: 'bad-token' });
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ detail: 'Token expired' }),
    });
    render(
      <Wrapper>
        <VerifyEmailScreen />
      </Wrapper>,
    );
    await waitFor(() => {
      expect(screen.getByText('Token expired')).toBeTruthy();
    });
  });

  it('shows error when fetch throws', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ token: 'valid-token' });
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));
    render(
      <Wrapper>
        <VerifyEmailScreen />
      </Wrapper>,
    );
    await waitFor(() => {
      expect(screen.getByText(/An error occurred/)).toBeTruthy();
    });
  });
});
