import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Badge,
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui';
import { runsApi } from '@/api';
import { BarChart3 } from 'lucide-react';
import type { RunStatus, ConfidenceLevel } from '@/types';

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

const confidenceConfig: Record<ConfidenceLevel, { label: string; variant: 'confident' | 'directional' | 'insufficient' }> = {
  confident: { label: 'Confident', variant: 'confident' },
  directional: { label: 'Directional', variant: 'directional' },
  insufficient: { label: 'Insufficient', variant: 'insufficient' },
};

export function ReportsPage() {
  const { data: runs = [], isLoading } = useQuery({
    queryKey: ['runs', 'with-results'],
    queryFn: () => runsApi.list({ status: 'completed' }),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">レポート</h1>
        <p className="text-muted-foreground">
          完了したテストの結果とインサイト
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>テスト結果一覧</CardTitle>
          <CardDescription>
            完了したRunの結果と結論の強さ
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              読み込み中...
            </div>
          ) : runs.length === 0 ? (
            <div className="text-center py-8">
              <BarChart3 className="mx-auto h-12 w-12 text-muted-foreground" />
              <h3 className="mt-4 text-lg font-semibold">レポートがありません</h3>
              <p className="mt-2 text-muted-foreground">
                テストが完了するとここに結果が表示されます
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Run名</TableHead>
                  <TableHead>ステータス</TableHead>
                  <TableHead>結論の強さ</TableHead>
                  <TableHead>勝者Intent</TableHead>
                  <TableHead>消化予算</TableHead>
                  <TableHead>完了日</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((run) => (
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
                      <Badge variant="outline">{statusLabels[run.status]}</Badge>
                    </TableCell>
                    <TableCell>
                      {/* This would come from the decision/report */}
                      <Badge variant="confident">
                        {confidenceConfig.confident.label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {/* Winner intent name would come from report */}
                      -
                    </TableCell>
                    <TableCell>¥{run.spend_total.toLocaleString()}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {run.ended_at
                        ? new Date(run.ended_at).toLocaleDateString('ja-JP')
                        : '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Confident</CardTitle>
            <CardDescription>統計的に有意な結果</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">
              {/* Count of confident results */}
              0
            </div>
            <p className="text-sm text-muted-foreground mt-1">テスト</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Directional</CardTitle>
            <CardDescription>傾向は見えるがデータ不足</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-amber-500">
              0
            </div>
            <p className="text-sm text-muted-foreground mt-1">テスト</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Insufficient</CardTitle>
            <CardDescription>データが不十分</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-500">
              0
            </div>
            <p className="text-sm text-muted-foreground mt-1">テスト</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
