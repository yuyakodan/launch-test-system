import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth-store';

export function useAuth() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading, user, tenant, setAuth, logout } = useAuthStore();

  useEffect(() => {
    // Check for token on mount
    const token = localStorage.getItem('auth_token');
    if (!token && !isAuthenticated) {
      navigate('/login');
    }
  }, [isAuthenticated, navigate]);

  return {
    isAuthenticated,
    isLoading,
    user,
    tenant,
    setAuth,
    logout,
  };
}
