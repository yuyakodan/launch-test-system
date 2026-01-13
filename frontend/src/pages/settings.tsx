import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
  Alert,
  AlertDescription,
} from '@/components/ui';
import { apiClient } from '@/api/client';
import { Settings, User, Building2, Bell, Shield, Check } from 'lucide-react';

interface NotificationSettings {
  testCompleted: boolean;
  stopConditionTriggered: boolean;
  dailySummary: boolean;
  weeklyReport: boolean;
  emailEnabled: boolean;
}

interface NotificationSettingsResponse {
  settings: NotificationSettings;
  email: string;
}

// Checkbox component for notification toggles
function NotificationCheckbox({
  id,
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label
      htmlFor={id}
      className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
        checked ? 'bg-primary/5 border-primary/20' : 'hover:bg-muted/50'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <input
        type="checkbox"
        id={id}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="mt-1 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
      />
      <div className="flex-1">
        <div className="font-medium text-sm">{label}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
    </label>
  );
}

export function SettingsPage() {
  const { user, tenant } = useAuthStore();
  const queryClient = useQueryClient();
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Fetch notification settings
  const { data: notificationData, isLoading: notifLoading } = useQuery({
    queryKey: ['notificationSettings'],
    queryFn: () => apiClient.get<NotificationSettingsResponse>('/me/notifications'),
  });

  // Local state for form
  const [notifSettings, setNotifSettings] = useState<NotificationSettings>({
    testCompleted: true,
    stopConditionTriggered: true,
    dailySummary: false,
    weeklyReport: true,
    emailEnabled: true,
  });

  // Update local state when data is fetched
  useEffect(() => {
    if (notificationData?.settings) {
      setNotifSettings(notificationData.settings);
    }
  }, [notificationData]);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: (settings: NotificationSettings) =>
      apiClient.patch<{ settings: NotificationSettings }>('/me/notifications', settings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notificationSettings'] });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    },
  });

  const handleSaveNotifications = () => {
    saveMutation.mutate(notifSettings);
  };

  const updateSetting = (key: keyof NotificationSettings, value: boolean) => {
    setNotifSettings((prev) => ({ ...prev, [key]: value }));
  };

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
          <CardContent className="space-y-4">
            {saveSuccess && (
              <Alert className="bg-green-50 border-green-200">
                <Check className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-700">
                  通知設定を保存しました
                </AlertDescription>
              </Alert>
            )}

            {notifLoading ? (
              <p className="text-sm text-muted-foreground">読み込み中...</p>
            ) : (
              <>
                {/* Master toggle */}
                <NotificationCheckbox
                  id="emailEnabled"
                  label="メール通知を有効化"
                  description="すべてのメール通知のマスタースイッチ"
                  checked={notifSettings.emailEnabled}
                  onChange={(checked) => updateSetting('emailEnabled', checked)}
                />

                <div className={`space-y-2 ${!notifSettings.emailEnabled ? 'opacity-50' : ''}`}>
                  <Label className="text-sm font-medium">通知タイプ</Label>

                  <NotificationCheckbox
                    id="testCompleted"
                    label="テスト完了通知"
                    description="Runが完了した時にメールで通知"
                    checked={notifSettings.testCompleted}
                    onChange={(checked) => updateSetting('testCompleted', checked)}
                    disabled={!notifSettings.emailEnabled}
                  />

                  <NotificationCheckbox
                    id="stopConditionTriggered"
                    label="停止条件発動通知"
                    description="予算上限やCPA上限などの停止条件が発動した時に通知"
                    checked={notifSettings.stopConditionTriggered}
                    onChange={(checked) => updateSetting('stopConditionTriggered', checked)}
                    disabled={!notifSettings.emailEnabled}
                  />

                  <NotificationCheckbox
                    id="dailySummary"
                    label="日次サマリーメール"
                    description="毎日朝9時にRunの進捗状況をまとめて送信"
                    checked={notifSettings.dailySummary}
                    onChange={(checked) => updateSetting('dailySummary', checked)}
                    disabled={!notifSettings.emailEnabled}
                  />

                  <NotificationCheckbox
                    id="weeklyReport"
                    label="週次レポート"
                    description="毎週月曜日に先週の実績レポートを送信"
                    checked={notifSettings.weeklyReport}
                    onChange={(checked) => updateSetting('weeklyReport', checked)}
                    disabled={!notifSettings.emailEnabled}
                  />
                </div>

                <div className="pt-4">
                  <Button
                    onClick={handleSaveNotifications}
                    disabled={saveMutation.isPending}
                  >
                    {saveMutation.isPending ? '保存中...' : '設定を保存'}
                  </Button>
                </div>
              </>
            )}
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
