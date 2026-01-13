import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Button,
  Input,
  Label,
  Textarea,
  Alert,
  AlertDescription,
} from '@/components/ui';
import { intentsApi } from '@/api';
import { ArrowLeft } from 'lucide-react';

export function IntentFormPage() {
  const { runId } = useParams<{ runId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    target_audience: '',
    key_message: '',
    cta: '',
  });
  const [error, setError] = useState('');

  const createMutation = useMutation({
    mutationFn: () =>
      intentsApi.create(runId!, {
        name: formData.name,
        description: formData.description || undefined,
        target_audience: formData.target_audience,
        key_message: formData.key_message,
        cta: formData.cta,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['intents', runId] });
      navigate(`/runs/${runId}`);
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Intentの作成に失敗しました');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      setError('Intent名を入力してください');
      return;
    }
    if (!formData.target_audience.trim()) {
      setError('ターゲットを入力してください');
      return;
    }
    if (!formData.key_message.trim()) {
      setError('キーメッセージを入力してください');
      return;
    }
    if (!formData.cta.trim()) {
      setError('CTAを入力してください');
      return;
    }
    createMutation.mutate();
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Button variant="ghost" onClick={() => navigate(-1)}>
        <ArrowLeft className="mr-2 h-4 w-4" />
        戻る
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>新規Intent作成</CardTitle>
          <CardDescription>
            テストする訴求バリエーションを定義します
          </CardDescription>
        </CardHeader>

        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="name">Intent名 *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="例: 価格訴求A"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">説明</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="このIntentの概要や狙い"
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="target">ターゲット *</Label>
              <Input
                id="target"
                value={formData.target_audience}
                onChange={(e) => setFormData({ ...formData, target_audience: e.target.value })}
                placeholder="例: 30代女性、美容に関心あり"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="message">キーメッセージ *</Label>
              <Textarea
                id="message"
                value={formData.key_message}
                onChange={(e) => setFormData({ ...formData, key_message: e.target.value })}
                placeholder="例: 今だけ初回50%オフ、効果を実感してください"
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="cta">CTA（行動喚起） *</Label>
              <Input
                id="cta"
                value={formData.cta}
                onChange={(e) => setFormData({ ...formData, cta: e.target.value })}
                placeholder="例: 今すぐ申し込む"
              />
            </div>
          </CardContent>

          <CardFooter className="flex justify-end gap-4">
            <Button type="button" variant="outline" onClick={() => navigate(-1)}>
              キャンセル
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? '作成中...' : '作成'}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
