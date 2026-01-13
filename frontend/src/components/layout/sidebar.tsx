import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  FolderKanban,
  PlayCircle,
  BarChart3,
  Settings,
  LogOut,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { authApi } from '@/api';

const navigation = [
  { name: 'ダッシュボード', href: '/', icon: LayoutDashboard },
  { name: 'プロジェクト', href: '/projects', icon: FolderKanban },
  { name: 'Run一覧', href: '/runs', icon: PlayCircle },
  { name: 'レポート', href: '/reports', icon: BarChart3 },
  { name: '設定', href: '/settings', icon: Settings },
];

export function Sidebar() {
  const location = useLocation();
  const { tenant, logout } = useAuthStore();

  const handleLogout = async () => {
    try {
      await authApi.logout();
    } catch {
      // ignore
    } finally {
      localStorage.removeItem('auth_token');
      logout();
    }
  };

  return (
    <div className="flex h-full w-64 flex-col bg-card border-r">
      {/* Logo */}
      <div className="flex h-16 items-center px-6 border-b">
        <Link to="/" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <span className="text-primary-foreground font-bold text-sm">LT</span>
          </div>
          <span className="font-semibold text-lg">Launch Test</span>
        </Link>
      </div>

      {/* Tenant name */}
      {tenant && (
        <div className="px-6 py-3 border-b">
          <p className="text-xs text-muted-foreground">テナント</p>
          <p className="text-sm font-medium truncate">{tenant.name}</p>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navigation.map((item) => {
          const isActive =
            item.href === '/'
              ? location.pathname === '/'
              : location.pathname.startsWith(item.href);

          return (
            <Link
              key={item.name}
              to={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <item.icon className="h-5 w-5" />
              {item.name}
            </Link>
          );
        })}
      </nav>

      {/* Logout */}
      <div className="p-3 border-t">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 w-full px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground rounded-md transition-colors"
        >
          <LogOut className="h-5 w-5" />
          ログアウト
        </button>
      </div>
    </div>
  );
}
