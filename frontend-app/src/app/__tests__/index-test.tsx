import { render, waitFor, screen } from '@testing-library/react-native';
import Main from '../index';
import * as auth from '@/services/api/authentication';

// Mock the authentication service
jest.mock('@/services/api/authentication', () => ({
  getToken: jest.fn(),
}));

describe('Main App Entry', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('redirects to /login when no token is present', async () => {
    (auth.getToken as jest.Mock).mockResolvedValueOnce(null);

    render(<Main />);

    await waitFor(() => {
      expect(screen.getByText('Redirect to /login')).toBeTruthy();
    });
  });

  it('redirects to /products when a token is present', async () => {
    (auth.getToken as jest.Mock).mockResolvedValueOnce('fake-token');

    render(<Main />);

    await waitFor(() => {
      expect(screen.getByText('Redirect to /products')).toBeTruthy();
    });
  });
});
