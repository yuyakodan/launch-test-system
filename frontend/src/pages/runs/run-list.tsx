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
// RunStatus type not directly used but kept as reference
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

const statusVariants: Record<string, 'default' | 'secondary' | 'outline'> = {
  draft: 'secondary',
  Draft: 'secondary',
  designing: 'secondary',
  Designing: 'secondary',
  generating: 'secondary',
  Generating: 'secondary',
  ready_for_review: 'outline',
  ReadyForReview: 'outline',
  approved: 'default',
  Approved: 'default',
  publishing: 'secondary',
  Publishing: 'secondary',
  live: 'default',
  Live: 'default',
  running: 'default',
  Running: 'default',
  paused: 'outline',
  Paused: 'outline',
  completed: 'secondary',
  Completed: 'secondary',
  archived: 'secondary',
  Archived: 'secondary',
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
                  const budgetCap = run.budget_cap ?? 0;
                  const spendTotal = run.spend_total ?? 0;
                  const progress = budgetCap > 0 ? (spendTotal / budgetCap) * 100 : 0;
                  const mode = run.mode ?? (run as unknown as { operationMode?: string }).operationMode ?? '-';
                  const startedAt = run.started_at ?? (run as unknown as { launchedAt?: string }).launchedAt;
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
                        <Badge variant={statusVariants[run.status] ?? 'secondary'}>
                          {statusLabels[run.status] ?? run.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="capitalize">{mode}</TableCell>
                      <TableCell>
                        {budgetCap > 0 ? (
                          <div className="space-y-1">
                            <Progress value={progress} className="h-2 w-24" />
                            <p className="text-xs text-muted-foreground">
                              ¥{spendTotal.toLocaleString()} / ¥{budgetCap.toLocaleString()}
                            </p>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {startedAt
                          ? new Date(startedAt).toLocaleDateString('ja-JP')
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
