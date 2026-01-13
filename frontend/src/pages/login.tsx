import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth-store';
import { Button, Input, Label, Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, Alert, AlertDescription } from '@/components/ui';

export function LoginPage() {
  const navigate = useNavigate();
  const { setAuth } = useAuthStore();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleDemoLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // Demo login - in production, this would be real authentication
      const demoUser = {
        id: 'demo-user-1',
        email: email || 'demo@example.com',
        name: 'デモユーザー',
        role: 'owner' as const,
        tenant_id: 'demo-tenant-1',
        created_at: new Date().toISOString(),
      };

      const demoTenant = {
        id: 'demo-tenant-1',
        name: 'デモテナント',
        slug: 'demo',
        settings_json: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 500));

      localStorage.setItem('auth_token', 'demo-token');
      setAuth(demoUser, demoTenant);
      navigate('/');
    } catch {
      setError('ログインに失敗しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="w-12 h-12 rounded-lg bg-primary mx-auto mb-4 flex items-center justify-center">
            <span className="text-primary-foreground font-bold text-xl">LT</span>
          </div>
          <CardTitle>Launch Test System</CardTitle>
          <CardDescription>
            ローンチテストの計画・実行・分析を一元管理
          </CardDescription>
        </CardHeader>

        <form onSubmit={handleDemoLogin}>
          <CardContent className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">メールアドレス</Label>
              <Input
                id="email"
                type="email"
                placeholder="demo@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">パスワード</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                disabled
              />
              <p className="text-xs text-muted-foreground">
                デモモードではパスワードは不要です
              </p>
            </div>
          </CardContent>

          <CardFooter>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'ログイン中...' : 'デモログイン'}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
