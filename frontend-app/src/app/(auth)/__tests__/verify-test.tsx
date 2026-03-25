import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import React from 'react';
import { screen, waitFor, fireEvent } from '@testing-library/react-native';
import { http, HttpResponse } from 'msw';
import { useLocalSearchParams, useRouter } from 'expo-router';
import VerifyEmailScreen from '../verify';
import { renderWithProviders } from '@/test-utils';
import { server } from '@/test-utils/server';
import * as auth from '@/services/api/authentication';

jest.mock('@/services/api/authentication', () => ({
  getToken: jest.fn(),
  getUser: jest.fn(),
  hasWebSessionFlag: jest.fn().mockReturnValue(false),
}));

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000/api';
const mockedGetToken = jest.mocked(auth.getToken);
const mockedGetUser = jest.mocked(auth.getUser);

describe('VerifyEmailScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetToken.mockResolvedValue(undefined);
    mockedGetUser.mockResolvedValue(undefined);
    (useRouter as jest.Mock).mockReturnValue({
      push: jest.fn(),
      replace: jest.fn(),
      back: jest.fn(),
      setParams: jest.fn(),
    });
  });

  it('shows error when no token is provided', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ token: undefined });
    renderWithProviders(<VerifyEmailScreen />, { withAuth: true });
    await waitFor(
      () => {
        expect(screen.getByText(/No verification token/)).toBeTruthy();
      },
      { timeout: 3000 },
    );
  });

  it('shows loading indicator on mount when token is present', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ token: 'valid-token' });
    // Delay the response so the loading text stays visible long enough for waitFor to catch it.
    server.use(
      http.post(`${API_URL}/auth/verify`, async () => {
        await new Promise<void>((resolve) => setTimeout(resolve, 200));
        return HttpResponse.json({}, { status: 200 });
      }),
    );
    renderWithProviders(<VerifyEmailScreen />, { withAuth: true });
    await waitFor(() => {
      expect(screen.getByText('Verifying your email...')).toBeTruthy();
    });
  });

  it('shows success message when verification succeeds', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ token: 'valid-token' });
    server.use(http.post(`${API_URL}/auth/verify`, () => HttpResponse.json({}, { status: 200 })));
    renderWithProviders(<VerifyEmailScreen />, { withAuth: true });
    await waitFor(() => {
      expect(screen.getByText(/Email verified successfully/)).toBeTruthy();
    });
  });

  it('shows API error when verification returns non-ok response', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ token: 'bad-token' });
    server.use(
      http.post(`${API_URL}/auth/verify`, () => HttpResponse.json({ detail: 'Token expired' }, { status: 400 })),
    );
    renderWithProviders(<VerifyEmailScreen />, { withAuth: true });
    await waitFor(() => {
      expect(screen.getByText('Token expired')).toBeTruthy();
    });
  });

  it('shows error when fetch throws', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ token: 'valid-token' });
    server.use(http.post(`${API_URL}/auth/verify`, () => HttpResponse.error()));
    renderWithProviders(<VerifyEmailScreen />, { withAuth: true });
    await waitFor(() => {
      expect(screen.getByText(/An error occurred/)).toBeTruthy();
    });
  });

  it('Back to Home button calls router.replace on error', async () => {
    const mockReplace = jest.fn();
    (useRouter as jest.Mock).mockReturnValue({
      push: jest.fn(),
      replace: mockReplace,
      back: jest.fn(),
      setParams: jest.fn(),
    });
    (useLocalSearchParams as jest.Mock).mockReturnValue({ token: undefined });
    renderWithProviders(<VerifyEmailScreen />, { withAuth: true });
    await waitFor(() => {
      expect(screen.getByText('Back to Home')).toBeTruthy();
    });
    fireEvent.press(screen.getByText('Back to Home'));
    expect(mockReplace).toHaveBeenCalledWith('/');
  });
});
