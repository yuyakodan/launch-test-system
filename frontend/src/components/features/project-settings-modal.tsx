import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogContent,
  DialogFooter,
  Button,
  Input,
  Label,
  Textarea,
  Alert,
  AlertDescription,
} from '@/components/ui';
import { projectsApi } from '@/api';
import type { Project } from '@/types';
import { Trash2, Archive } from 'lucide-react';

interface ProjectSettingsModalProps {
  project: Project;
  open: boolean;
  onClose: () => void;
  onDeleted?: () => void;
}

export function ProjectSettingsModal({
  project,
  open,
  onClose,
  onDeleted,
}: ProjectSettingsModalProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? '');
  const [error, setError] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteInput, setDeleteInput] = useState('');

  const isArchived = (project as unknown as { archivedAt?: string }).archivedAt != null;

  const updateMutation = useMutation({
    mutationFn: (data: { name?: string; description?: string }) =>
      projectsApi.update(project.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['projects', project.id] });
      onClose();
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : '更新に失敗しました');
    },
  });

  const archiveMutation = useMutation({
    mutationFn: () => projectsApi.archive(project.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['projects', project.id] });
      onClose();
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'アーカイブに失敗しました');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => projectsApi.delete(project.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      onDeleted?.();
      onClose();
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : '削除に失敗しました');
    },
  });

  const handleSave = () => {
    if (!name.trim()) {
      setError('プロジェクト名を入力してください');
      return;
    }

    setError('');
    updateMutation.mutate({
      name: name.trim(),
      description: description.trim() || undefined,
    });
  };

  const handleArchive = () => {
    setError('');
    archiveMutation.mutate();
  };

  const handleDelete = () => {
    if (deleteInput !== project.name) {
      setError('プロジェクト名が一致しません');
      return;
    }

    setError('');
    deleteMutation.mutate();
  };

  const isPending = updateMutation.isPending || archiveMutation.isPending || deleteMutation.isPending;

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogHeader>
        <DialogTitle>プロジェクト設定</DialogTitle>
        <DialogDescription>
          プロジェクトの設定を変更します
        </DialogDescription>
      </DialogHeader>

      <DialogContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {!showDeleteConfirm ? (
          <>
            {/* Basic settings */}
            <div className="space-y-2">
              <Label htmlFor="project-name">プロジェクト名</Label>
              <Input
                id="project-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="プロジェクト名"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="project-description">説明</Label>
              <Textarea
                id="project-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="プロジェクトの説明（オプション）"
                rows={3}
              />
            </div>

            {/* Danger zone */}
            <div className="pt-4 border-t">
              <h3 className="text-sm font-medium text-destructive mb-3">危険な操作</h3>
              <div className="space-y-2">
                {!isArchived && (
                  <Button
                    variant="outline"
                    className="w-full justify-start text-amber-600 border-amber-200 hover:bg-amber-50"
                    onClick={handleArchive}
                    disabled={isPending}
                  >
                    <Archive className="mr-2 h-4 w-4" />
                    プロジェクトをアーカイブ
                  </Button>
                )}
                <Button
                  variant="outline"
                  className="w-full justify-start text-destructive border-destructive/20 hover:bg-destructive/10"
                  onClick={() => setShowDeleteConfirm(true)}
                  disabled={isPending}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  プロジェクトを削除
                </Button>
              </div>
            </div>
          </>
        ) : (
          /* Delete confirmation */
          <div className="space-y-4">
            <Alert variant="destructive">
              <AlertDescription>
                この操作は取り消せません。プロジェクトとすべての関連データが完全に削除されます。
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <Label htmlFor="delete-confirm">
                確認のため、プロジェクト名「<strong>{project.name}</strong>」を入力してください
              </Label>
              <Input
                id="delete-confirm"
                value={deleteInput}
                onChange={(e) => setDeleteInput(e.target.value)}
                placeholder={project.name}
              />
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setDeleteInput('');
                  setError('');
                }}
                disabled={isPending}
              >
                キャンセル
              </Button>
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={deleteInput !== project.name || isPending}
              >
                {deleteMutation.isPending ? '削除中...' : '完全に削除する'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>

      {!showDeleteConfirm && (
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            キャンセル
          </Button>
          <Button onClick={handleSave} disabled={isPending}>
            {updateMutation.isPending ? '保存中...' : '保存'}
          </Button>
        </DialogFooter>
      )}
    </Dialog>
  );
}
