import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User, Tenant, AuthState } from '@/types';

interface AuthStore extends AuthState {
  setUser: (user: User | null) => void;
  setTenant: (tenant: Tenant | null) => void;
  setAuth: (user: User | null, tenant: Tenant | null) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      user: null,
      tenant: null,
      isAuthenticated: false,
      isLoading: true,

      setUser: (user) =>
        set({
          user,
          isAuthenticated: !!user,
          isLoading: false,
        }),

      setTenant: (tenant) => set({ tenant }),

      setAuth: (user, tenant) =>
        set({
          user,
          tenant,
          isAuthenticated: !!user,
          isLoading: false,
        }),

      logout: () =>
        set({
          user: null,
          tenant: null,
          isAuthenticated: false,
          isLoading: false,
        }),
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        user: state.user,
        tenant: state.tenant,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
