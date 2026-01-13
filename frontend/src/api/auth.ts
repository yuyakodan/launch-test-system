import { apiClient } from './client';
import type { User, Tenant } from '@/types';

export interface MeResponse {
  user: User;
  tenant: Tenant;
}

export const authApi = {
  getMe: () => apiClient.get<MeResponse>('/me'),

  logout: () => apiClient.post<void>('/auth/logout'),

  // Demo login (for development)
  demoLogin: (email: string) =>
    apiClient.post<{ token: string; user: User }>('/auth/demo-login', { email }),
};
