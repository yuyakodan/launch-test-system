import { useAuthStore } from '@/stores/auth-store';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Button,
  Input,
  Label,
} from '@/components/ui';
import { Settings, User, Building2, Bell, Shield } from 'lucide-react';

export function SettingsPage() {
  const { user, tenant } = useAuthStore();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">設定</h1>
        <p className="text-muted-foreground">
          アカウントとテナントの設定を管理
        </p>
      </div>

      <div className="grid gap-6">
        {/* Profile settings */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <User className="h-5 w-5" />
              <CardTitle>プロフィール</CardTitle>
            </div>
            <CardDescription>あなたのアカウント情報</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>名前</Label>
                <Input value={user?.name || ''} disabled />
              </div>
              <div className="space-y-2">
                <Label>メールアドレス</Label>
                <Input value={user?.email || ''} disabled />
              </div>
              <div className="space-y-2">
                <Label>ロール</Label>
                <Input value={user?.role || ''} disabled className="capitalize" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tenant settings */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              <CardTitle>テナント設定</CardTitle>
            </div>
            <CardDescription>組織の基本設定</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>テナント名</Label>
                <Input value={tenant?.name || ''} disabled />
              </div>
              <div className="space-y-2">
                <Label>スラッグ</Label>
                <Input value={tenant?.slug || ''} disabled />
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              テナント設定の変更は管理者にお問い合わせください
            </p>
          </CardContent>
        </Card>

        {/* Notification settings */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              <CardTitle>通知設定</CardTitle>
            </div>
            <CardDescription>メールやプッシュ通知の設定</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              通知設定は今後のアップデートで追加予定です
            </p>
          </CardContent>
        </Card>

        {/* Security settings */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              <CardTitle>セキュリティ</CardTitle>
            </div>
            <CardDescription>パスワードと認証の設定</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button variant="outline" disabled>
              パスワードを変更
            </Button>
            <p className="text-sm text-muted-foreground">
              デモモードではパスワード変更は無効です
            </p>
          </CardContent>
        </Card>

        {/* API settings */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              <CardTitle>API設定</CardTitle>
            </div>
            <CardDescription>APIキーとWebhookの設定</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              API設定は今後のアップデートで追加予定です
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
