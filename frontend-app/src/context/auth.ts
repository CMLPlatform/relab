import { createContext, useContext } from 'react';
import type { User } from '@/types/User';

export interface AuthContextType {
  user: User | undefined;
  isLoading: boolean;
  refetch: (forceRefresh?: boolean) => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
