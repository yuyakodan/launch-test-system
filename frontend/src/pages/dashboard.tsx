import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Badge,
  Button,
} from '@/components/ui';
import { projectsApi, runsApi } from '@/api';
import { Plus, ArrowRight, PlayCircle, CheckCircle, PauseCircle, Clock } from 'lucide-react';
import type { RunStatus } from '@/types';

const statusConfig: Record<RunStatus, { label: string; color: string; icon: typeof PlayCircle }> = {
  draft: { label: '下書き', color: 'bg-gray-500', icon: Clock },
  designing: { label: '設計中', color: 'bg-blue-500', icon: Clock },
  generating: { label: '生成中', color: 'bg-blue-500', icon: Clock },
  ready_for_review: { label: 'レビュー待ち', color: 'bg-yellow-500', icon: Clock },
  approved: { label: '承認済み', color: 'bg-green-500', icon: CheckCircle },
  publishing: { label: '公開中', color: 'bg-blue-500', icon: Clock },
  live: { label: 'ライブ', color: 'bg-green-500', icon: PlayCircle },
  running: { label: '実行中', color: 'bg-green-500', icon: PlayCircle },
  paused: { label: '一時停止', color: 'bg-yellow-500', icon: PauseCircle },
  completed: { label: '完了', color: 'bg-gray-500', icon: CheckCircle },
  archived: { label: 'アーカイブ', color: 'bg-gray-500', icon: CheckCircle },
};

export function DashboardPage() {
  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectsApi.list({ limit: 5 }),
  });

  const { data: runs = [] } = useQuery({
    queryKey: ['runs', 'recent'],
    queryFn: () => runsApi.list({ limit: 5 }),
  });

  const activeRuns = runs.filter((r) => ['running', 'live'].includes(r.status));
  const pendingRuns = runs.filter((r) => ['ready_for_review', 'approved'].includes(r.status));

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">ダッシュボード</h1>
          <p className="text-muted-foreground">
            ローンチテストの概要と最新の状況
          </p>
        </div>
        <Link to="/runs/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            新規Run作成
          </Button>
        </Link>
      </div>

      {/* Stats cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">アクティブプロジェクト</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{projects.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">実行中のRun</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeRuns.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">承認待ち</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pendingRuns.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">今月の完了</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {runs.filter((r) => r.status === 'completed').length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent runs */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>最新のRun</CardTitle>
              <CardDescription>直近のテスト実行状況</CardDescription>
            </div>
            <Link to="/runs">
              <Button variant="ghost" size="sm">
                すべて見る
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {runs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>まだRunがありません</p>
              <Link to="/runs/new">
                <Button variant="outline" className="mt-4">
                  <Plus className="mr-2 h-4 w-4" />
                  最初のRunを作成
                </Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {runs.slice(0, 5).map((run) => {
                const config = statusConfig[run.status];
                const Icon = config.icon;
                return (
                  <Link
                    key={run.id}
                    to={`/runs/${run.id}`}
                    className="flex items-center justify-between p-4 rounded-lg border hover:bg-muted transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className={`p-2 rounded-full ${config.color}`}>
                        <Icon className="h-4 w-4 text-white" />
                      </div>
                      <div>
                        <p className="font-medium">{run.name}</p>
                        <p className="text-sm text-muted-foreground">
                          予算: ¥{run.budget_cap.toLocaleString()} / 消化: ¥
                          {run.spend_total.toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <Badge variant="outline">{config.label}</Badge>
                  </Link>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent projects */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>プロジェクト</CardTitle>
              <CardDescription>登録されているプロジェクト</CardDescription>
            </div>
            <Link to="/projects">
              <Button variant="ghost" size="sm">
                すべて見る
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {projects.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>まだプロジェクトがありません</p>
              <Link to="/projects/new">
                <Button variant="outline" className="mt-4">
                  <Plus className="mr-2 h-4 w-4" />
                  最初のプロジェクトを作成
                </Button>
              </Link>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {projects.slice(0, 4).map((project) => (
                <Link
                  key={project.id}
                  to={`/projects/${project.id}`}
                  className="p-4 rounded-lg border hover:bg-muted transition-colors"
                >
                  <h3 className="font-medium">{project.name}</h3>
                  {project.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                      {project.description}
                    </p>
                  )}
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
