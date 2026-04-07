import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react-native';
import Main from '../index';

describe('Main App Entry', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('redirects guests to /products', async () => {
    render(<Main />);

    await waitFor(() => {
      expect(screen.getByText('Redirect to /products')).toBeOnTheScreen();
    });
  });
});
