import { useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Button,
  Badge,
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui';
import { projectsApi, runsApi } from '@/api';
import { ProjectSettingsModal } from '@/components/features/project-settings-modal';
import { ArrowLeft, Plus, Settings } from 'lucide-react';
// RunStatus type kept as reference
// import type { RunStatus } from '@/types';

const statusLabels: Record<string, string> = {
  draft: '下書き',
  Draft: '下書き',
  designing: '設計中',
  Designing: '設計中',
  generating: '生成中',
  Generating: '生成中',
  ready_for_review: 'レビュー待ち',
  ReadyForReview: 'レビュー待ち',
  approved: '承認済み',
  Approved: '承認済み',
  publishing: '公開中',
  Publishing: '公開中',
  live: 'ライブ',
  Live: 'ライブ',
  running: '実行中',
  Running: '実行中',
  paused: '一時停止',
  Paused: '一時停止',
  completed: '完了',
  Completed: '完了',
  archived: 'アーカイブ',
  Archived: 'アーカイブ',
};

export function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const { data: project, isLoading: projectLoading } = useQuery({
    queryKey: ['projects', id],
    queryFn: () => projectsApi.get(id!),
    enabled: !!id,
  });

  const { data: runs = [], isLoading: runsLoading } = useQuery({
    queryKey: ['runs', { project_id: id }],
    queryFn: () => runsApi.list({ project_id: id }),
    enabled: !!id,
  });

  if (projectLoading) {
    return <div className="text-center py-8 text-muted-foreground">読み込み中...</div>;
  }

  if (!project) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">プロジェクトが見つかりません</p>
        <Button className="mt-4" onClick={() => navigate('/projects')}>
          プロジェクト一覧に戻る
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Button variant="ghost" onClick={() => navigate('/projects')}>
        <ArrowLeft className="mr-2 h-4 w-4" />
        プロジェクト一覧
      </Button>

      {/* Project header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">{project.name}</h1>
            {(() => {
              const archivedAt = (project as unknown as { archivedAt?: string }).archivedAt;
              const isActive = archivedAt == null && (project.status == null || ['active', 'Active'].includes(project.status));
              return (
                <Badge variant={isActive ? 'default' : 'secondary'}>
                  {isActive ? 'アクティブ' : 'アーカイブ'}
                </Badge>
              );
            })()}
          </div>
          {project.description && (
            <p className="text-muted-foreground mt-2">{project.description}</p>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)}>
            <Settings className="mr-2 h-4 w-4" />
            設定
          </Button>
          <Link to={`/runs/new?project=${id}`}>
            <Button size="sm">
              <Plus className="mr-2 h-4 w-4" />
              新規Run
            </Button>
          </Link>
        </div>
      </div>

      {/* Project stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">総Run数</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{runs.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">実行中</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {runs.filter((r) => ['running', 'live', 'Running', 'Live'].includes(r.status)).length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">完了</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {runs.filter((r) => ['completed', 'Completed'].includes(r.status)).length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">総消化予算</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ¥{runs.reduce((sum, r) => sum + (r.spend_total ?? 0), 0).toLocaleString()}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Runs list */}
      <Card>
        <CardHeader>
          <CardTitle>Run一覧</CardTitle>
          <CardDescription>このプロジェクトのテスト実行</CardDescription>
        </CardHeader>
        <CardContent>
          {runsLoading ? (
            <div className="text-center py-8 text-muted-foreground">読み込み中...</div>
          ) : runs.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">まだRunがありません</p>
              <Link to={`/runs/new?project=${id}`}>
                <Button className="mt-4">
                  <Plus className="mr-2 h-4 w-4" />
                  最初のRunを作成
                </Button>
              </Link>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Run名</TableHead>
                  <TableHead>ステータス</TableHead>
                  <TableHead>モード</TableHead>
                  <TableHead>予算</TableHead>
                  <TableHead>消化</TableHead>
                  <TableHead>作成日</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((run) => {
                  const budgetCap = run.budget_cap ?? 0;
                  const spendTotal = run.spend_total ?? 0;
                  const mode = run.mode ?? (run as unknown as { operationMode?: string }).operationMode ?? '-';
                  const createdAt = run.created_at;
                  return (
                    <TableRow key={run.id}>
                      <TableCell>
                        <Link
                          to={`/runs/${run.id}`}
                          className="font-medium hover:underline"
                        >
                          {run.name}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{statusLabels[run.status] ?? run.status}</Badge>
                      </TableCell>
                      <TableCell className="capitalize">{mode}</TableCell>
                      <TableCell>¥{budgetCap.toLocaleString()}</TableCell>
                      <TableCell>¥{spendTotal.toLocaleString()}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {createdAt ? new Date(createdAt).toLocaleDateString('ja-JP') : '-'}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Settings modal */}
      <ProjectSettingsModal
        project={project}
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onDeleted={() => navigate('/projects')}
      />
    </div>
  );
}
