import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react-native';
import Layout from '../_layout';
import * as auth from '@/services/api/authentication';

jest.mock('@/services/api/authentication', () => ({
  getUser: jest.fn(),
}));

describe('_layout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('redirects to login when getUser returns null', async () => {
    (auth.getUser as jest.Mock).mockResolvedValueOnce(null);
    render(<Layout />);
    await waitFor(() => {
      expect(screen.getByText('Redirect to /(auth)/login')).toBeTruthy();
    });
  });

  it('redirects to login when getUser rejects', async () => {
    (auth.getUser as jest.Mock).mockRejectedValueOnce(new Error('Network error'));
    render(<Layout />);
    await waitFor(() => {
      expect(screen.getByText('Redirect to /(auth)/login')).toBeTruthy();
    });
  });

  it('does not redirect when user is authenticated', async () => {
    (auth.getUser as jest.Mock).mockResolvedValueOnce({
      id: 1,
      username: 'testuser',
      email: 'test@example.com',
      isActive: true,
      isVerified: true,
      isSuperuser: false,
    });
    render(<Layout />);
    await waitFor(() => {
      expect(screen.queryByText('Redirect to /(auth)/login')).toBeNull();
    });
  });
});
