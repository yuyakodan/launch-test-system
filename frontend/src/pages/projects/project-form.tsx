import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { projectsApi } from '@/api';
import { ArrowLeft } from 'lucide-react';

export function ProjectFormPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');

  const createMutation = useMutation({
    mutationFn: projectsApi.create,
    onSuccess: (project) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      navigate(`/projects/${project.id}`);
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'プロジェクトの作成に失敗しました');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('プロジェクト名を入力してください');
      return;
    }
    createMutation.mutate({
      name: name.trim(),
      description: description.trim() || undefined,
    });
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Button variant="ghost" onClick={() => navigate(-1)}>
        <ArrowLeft className="mr-2 h-4 w-4" />
        戻る
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>新規プロジェクト作成</CardTitle>
          <CardDescription>
            ローンチテストを行うプロジェクトの情報を入力してください
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
              <Label htmlFor="name">プロジェクト名 *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例: 新商品Aローンチテスト"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">説明</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="プロジェクトの目的や概要を記入"
                rows={4}
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
