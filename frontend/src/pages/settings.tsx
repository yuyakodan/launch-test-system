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
import { Settings, User, Building2, Bell, Shield, Check, Key, Plus, Trash2, Copy, Link } from 'lucide-react';

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

interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  lastFourChars?: string;
  fullKey?: string;
  createdAt: string;
  lastUsedAt: string | null;
  status: string;
}

interface ApiKeysResponse {
  keys: ApiKey[];
  limit: number;
}

interface WebhookSettings {
  url: string;
  enabled: boolean;
  events: {
    testCompleted: boolean;
    stopConditionTriggered: boolean;
    decisionMade: boolean;
  };
}

interface WebhookResponse {
  webhook: WebhookSettings;
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
        <ApiSettingsSection />
      </div>
    </div>
  );
}

/**
 * API Settings Section Component
 */
function ApiSettingsSection() {
  const queryClient = useQueryClient();
  const [newKeyName, setNewKeyName] = useState('');
  const [newKey, setNewKey] = useState<ApiKey | null>(null);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookEnabled, setWebhookEnabled] = useState(false);
  const [webhookEvents, setWebhookEvents] = useState({
    testCompleted: true,
    stopConditionTriggered: true,
    decisionMade: false,
  });
  const [webhookSaveSuccess, setWebhookSaveSuccess] = useState(false);

  // Fetch API keys
  const { data: apiKeysData, isLoading: keysLoading } = useQuery({
    queryKey: ['apiKeys'],
    queryFn: () => apiClient.get<ApiKeysResponse>('/me/api-keys'),
  });

  // Fetch webhook settings
  const { data: webhookData, isLoading: webhookLoading } = useQuery({
    queryKey: ['webhookSettings'],
    queryFn: () => apiClient.get<WebhookResponse>('/me/webhooks'),
  });

  // Update webhook state when data is fetched
  useEffect(() => {
    if (webhookData?.webhook) {
      setWebhookUrl(webhookData.webhook.url);
      setWebhookEnabled(webhookData.webhook.enabled);
      setWebhookEvents(webhookData.webhook.events);
    }
  }, [webhookData]);

  // Create API key mutation
  const createKeyMutation = useMutation({
    mutationFn: (name: string) =>
      apiClient.post<{ key: ApiKey; warning: string }>('/me/api-keys', { name }),
    onSuccess: (data) => {
      setNewKey(data.key);
      setNewKeyName('');
      queryClient.invalidateQueries({ queryKey: ['apiKeys'] });
    },
  });

  // Delete API key mutation
  const deleteKeyMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete<void>(`/me/api-keys/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['apiKeys'] });
    },
  });

  // Save webhook settings mutation
  const saveWebhookMutation = useMutation({
    mutationFn: (settings: { url: string; enabled: boolean; events: typeof webhookEvents }) =>
      apiClient.patch<WebhookResponse>('/me/webhooks', settings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhookSettings'] });
      setWebhookSaveSuccess(true);
      setTimeout(() => setWebhookSaveSuccess(false), 3000);
    },
  });

  const handleCreateKey = () => {
    if (!newKeyName.trim()) return;
    createKeyMutation.mutate(newKeyName.trim());
  };

  const handleCopyKey = () => {
    if (newKey?.fullKey) {
      navigator.clipboard.writeText(newKey.fullKey);
    }
  };

  const handleSaveWebhook = () => {
    saveWebhookMutation.mutate({
      url: webhookUrl,
      enabled: webhookEnabled,
      events: webhookEvents,
    });
  };

  return (
    <>
      {/* API Keys */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            <CardTitle>APIキー</CardTitle>
          </div>
          <CardDescription>API経由でシステムにアクセスするためのキー</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* New key display */}
          {newKey?.fullKey && (
            <Alert className="bg-amber-50 border-amber-200">
              <AlertDescription>
                <div className="space-y-2">
                  <p className="text-amber-700 font-medium">
                    APIキーが生成されました。このキーは一度しか表示されません。
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 p-2 bg-white border rounded text-sm font-mono break-all">
                      {newKey.fullKey}
                    </code>
                    <Button variant="outline" size="sm" onClick={handleCopyKey}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setNewKey(null)}
                    className="text-amber-700"
                  >
                    閉じる
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Existing keys */}
          {keysLoading ? (
            <p className="text-sm text-muted-foreground">読み込み中...</p>
          ) : (
            <div className="space-y-2">
              {apiKeysData?.keys.map((key) => (
                <div
                  key={key.id}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div>
                    <div className="font-medium text-sm">{key.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {key.prefix}****{key.lastFourChars} · 作成日:{' '}
                      {new Date(key.createdAt).toLocaleDateString('ja-JP')}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => deleteKeyMutation.mutate(key.id)}
                    disabled={deleteKeyMutation.isPending}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Create new key */}
          <div className="flex gap-2 pt-2">
            <Input
              placeholder="キー名（例: Production API）"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              className="flex-1"
            />
            <Button
              onClick={handleCreateKey}
              disabled={!newKeyName.trim() || createKeyMutation.isPending}
            >
              <Plus className="mr-2 h-4 w-4" />
              生成
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Webhook settings */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Link className="h-5 w-5" />
            <CardTitle>Webhook設定</CardTitle>
          </div>
          <CardDescription>イベント発生時に外部URLに通知を送信</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {webhookSaveSuccess && (
            <Alert className="bg-green-50 border-green-200">
              <Check className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-700">
                Webhook設定を保存しました
              </AlertDescription>
            </Alert>
          )}

          {webhookLoading ? (
            <p className="text-sm text-muted-foreground">読み込み中...</p>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="webhook-url">Webhook URL</Label>
                <Input
                  id="webhook-url"
                  type="url"
                  placeholder="https://your-server.com/webhook"
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  HTTPSで始まるURLを指定してください
                </p>
              </div>

              <NotificationCheckbox
                id="webhook-enabled"
                label="Webhookを有効化"
                description="イベント発生時にWebhookを送信"
                checked={webhookEnabled}
                onChange={setWebhookEnabled}
              />

              <div className={`space-y-2 ${!webhookEnabled ? 'opacity-50' : ''}`}>
                <Label className="text-sm font-medium">通知するイベント</Label>

                <NotificationCheckbox
                  id="webhook-testCompleted"
                  label="テスト完了"
                  description="Runが完了した時"
                  checked={webhookEvents.testCompleted}
                  onChange={(checked) =>
                    setWebhookEvents((prev) => ({ ...prev, testCompleted: checked }))
                  }
                  disabled={!webhookEnabled}
                />

                <NotificationCheckbox
                  id="webhook-stopCondition"
                  label="停止条件発動"
                  description="停止条件が発動した時"
                  checked={webhookEvents.stopConditionTriggered}
                  onChange={(checked) =>
                    setWebhookEvents((prev) => ({ ...prev, stopConditionTriggered: checked }))
                  }
                  disabled={!webhookEnabled}
                />

                <NotificationCheckbox
                  id="webhook-decisionMade"
                  label="判定完了"
                  description="統計判定が完了した時"
                  checked={webhookEvents.decisionMade}
                  onChange={(checked) =>
                    setWebhookEvents((prev) => ({ ...prev, decisionMade: checked }))
                  }
                  disabled={!webhookEnabled}
                />
              </div>

              <div className="pt-4">
                <Button
                  onClick={handleSaveWebhook}
                  disabled={saveWebhookMutation.isPending}
                >
                  {saveWebhookMutation.isPending ? '保存中...' : '設定を保存'}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </>
  );
}
