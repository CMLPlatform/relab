import AsyncStorage from '@react-native-async-storage/async-storage';
import { login, logout, getToken, getUser, register, verify } from '../authentication';

// Mock fetch
global.fetch = jest.fn();

describe('Authentication Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    AsyncStorage.clear();
  });

  describe('login', () => {
    it('should successfully login and return token', async () => {
      const mockToken = 'test-token-123';
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ access_token: mockToken }),
      });

      const token = await login('test@example.com', 'password123');

      expect(token).toBe(mockToken);
      expect(await AsyncStorage.getItem('username')).toBe('test@example.com');
      expect(await AsyncStorage.getItem('password')).toBe('password123');
    });

    it('should return undefined for invalid credentials', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({}),
      });

      const token = await login('wrong@example.com', 'wrongpassword');

      expect(token).toBeUndefined();
    });

    it('should throw error on network failure', async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

      await expect(login('test@example.com', 'password123')).rejects.toThrow(
        'Unable to reach server. Please try again later.'
      );
    });

    it('should handle non-400 HTTP errors', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ detail: 'Internal server error' }),
      });

      await expect(login('test@example.com', 'password123')).rejects.toThrow(
        'Unable to reach server. Please try again later.'
      );
    });
  });

  describe('logout', () => {
    it('should clear stored credentials', async () => {
      await AsyncStorage.setItem('username', 'test@example.com');
      await AsyncStorage.setItem('password', 'password123');

      await logout();

      expect(await AsyncStorage.getItem('username')).toBeNull();
      expect(await AsyncStorage.getItem('password')).toBeNull();
    });
  });

  describe('getToken', () => {
    it('should return token from login if credentials exist', async () => {
      const mockToken = 'test-token-123';
      await AsyncStorage.setItem('username', 'test@example.com');
      await AsyncStorage.setItem('password', 'password123');

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ access_token: mockToken }),
      });

      const token = await getToken();

      expect(token).toBe(mockToken);
    });

    it('should return undefined if no credentials stored', async () => {
      const token = await getToken();

      expect(token).toBeUndefined();
    });

    it('should return undefined if login fails', async () => {
      await AsyncStorage.setItem('username', 'test@example.com');
      await AsyncStorage.setItem('password', 'password123');

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({}),
      });

      const token = await getToken();

      expect(token).toBeUndefined();
    });
  });

  describe('getUser', () => {
    it('should fetch and return user data', async () => {
      const mockToken = 'test-token-123';
      const mockUserData = {
        id: 1,
        email: 'test@example.com',
        username: 'testuser',
        is_active: true,
        is_superuser: false,
        is_verified: true,
      };

      await AsyncStorage.setItem('username', 'test@example.com');
      await AsyncStorage.setItem('password', 'password123');

      // Mock login
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ access_token: mockToken }),
      });

      // Mock getUser
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockUserData,
      });

      const user = await getUser();

      expect(user).toEqual({
        id: 1,
        email: 'test@example.com',
        username: 'testuser',
        isActive: true,
        isSuperuser: false,
        isVerified: true,
      });
    });

    it('should return undefined if not authenticated', async () => {
      const user = await getUser();

      expect(user).toBeUndefined();
    });

    it('should return undefined on fetch error', async () => {
      const mockToken = 'test-token-123';
      await AsyncStorage.setItem('username', 'test@example.com');
      await AsyncStorage.setItem('password', 'password123');

      // Mock login
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ access_token: mockToken }),
      });

      // Mock getUser failure
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ detail: 'Unauthorized' }),
      });

      const user = await getUser();

      expect(user).toBeUndefined();
    });
  });

  describe('register', () => {
    it('should successfully register a user', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
      });

      const result = await register('testuser', 'test@example.com', 'password123');

      expect(result).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(URL),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            username: 'testuser',
            email: 'test@example.com',
            password: 'password123',
          }),
        })
      );
    });

    it('should return false on registration failure', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
      });

      const result = await register('testuser', 'test@example.com', 'password123');

      expect(result).toBe(false);
    });
  });

  describe('verify', () => {
    it('should successfully request verification token', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
      });

      const result = await verify('test@example.com');

      expect(result).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(URL),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            email: 'test@example.com',
          }),
        })
      );
    });

    it('should return false on verification request failure', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
      });

      const result = await verify('test@example.com');

      expect(result).toBe(false);
    });
  });
});
