import { Link } from 'react-router-dom';
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
  Progress,
} from '@/components/ui';
import { runsApi } from '@/api';
import { Plus, PlayCircle } from 'lucide-react';
import type { RunStatus } from '@/types';

const statusLabels: Record<RunStatus, string> = {
  draft: '下書き',
  designing: '設計中',
  generating: '生成中',
  ready_for_review: 'レビュー待ち',
  approved: '承認済み',
  publishing: '公開中',
  live: 'ライブ',
  running: '実行中',
  paused: '一時停止',
  completed: '完了',
  archived: 'アーカイブ',
};

const statusVariants: Record<RunStatus, 'default' | 'secondary' | 'outline'> = {
  draft: 'secondary',
  designing: 'secondary',
  generating: 'secondary',
  ready_for_review: 'outline',
  approved: 'default',
  publishing: 'secondary',
  live: 'default',
  running: 'default',
  paused: 'outline',
  completed: 'secondary',
  archived: 'secondary',
};

export function RunListPage() {
  const { data: runs = [], isLoading } = useQuery({
    queryKey: ['runs'],
    queryFn: () => runsApi.list(),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Run一覧</h1>
          <p className="text-muted-foreground">
            すべてのテスト実行を管理
          </p>
        </div>
        <Link to="/runs/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            新規Run作成
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Run一覧</CardTitle>
          <CardDescription>
            登録されているすべてのテスト実行
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              読み込み中...
            </div>
          ) : runs.length === 0 ? (
            <div className="text-center py-8">
              <PlayCircle className="mx-auto h-12 w-12 text-muted-foreground" />
              <h3 className="mt-4 text-lg font-semibold">Runがありません</h3>
              <p className="mt-2 text-muted-foreground">
                最初のRunを作成してテストを開始しましょう
              </p>
              <Link to="/runs/new">
                <Button className="mt-4">
                  <Plus className="mr-2 h-4 w-4" />
                  Runを作成
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
                  <TableHead>予算消化</TableHead>
                  <TableHead>開始日</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((run) => {
                  const progress = run.budget_cap > 0
                    ? (run.spend_total / run.budget_cap) * 100
                    : 0;
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
                        <Badge variant={statusVariants[run.status]}>
                          {statusLabels[run.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="capitalize">{run.mode}</TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <Progress value={progress} className="h-2 w-24" />
                          <p className="text-xs text-muted-foreground">
                            ¥{run.spend_total.toLocaleString()} / ¥{run.budget_cap.toLocaleString()}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {run.started_at
                          ? new Date(run.started_at).toLocaleDateString('ja-JP')
                          : '-'}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
