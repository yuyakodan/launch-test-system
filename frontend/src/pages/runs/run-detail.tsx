import { Link, useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Button,
  Badge,
  Progress,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
  Alert,
  AlertTitle,
  AlertDescription,
} from '@/components/ui';
import { runsApi, intentsApi } from '@/api';
import {
  ArrowLeft,
  Play,
  Pause,
  Square,
  Plus,
  BarChart3,
  CheckCircle,
  AlertCircle,
} from 'lucide-react';
import type { RunStatus, ConfidenceLevel } from '@/types';

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

const confidenceLabels: Record<ConfidenceLevel, { label: string; variant: 'confident' | 'directional' | 'insufficient' }> = {
  confident: { label: 'Confident', variant: 'confident' },
  directional: { label: 'Directional', variant: 'directional' },
  insufficient: { label: 'Insufficient', variant: 'insufficient' },
};

export function RunDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: run, isLoading: runLoading } = useQuery({
    queryKey: ['runs', id],
    queryFn: () => runsApi.get(id!),
    enabled: !!id,
  });

  const { data: intents = [] } = useQuery({
    queryKey: ['intents', id],
    queryFn: () => intentsApi.list(id!),
    enabled: !!id,
  });

  const { data: report } = useQuery({
    queryKey: ['runs', id, 'report'],
    queryFn: () => runsApi.getReport(id!),
    enabled: !!id && ['running', 'paused', 'completed'].includes(run?.status || ''),
  });

  const launchMutation = useMutation({
    mutationFn: () => runsApi.launch(id!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['runs', id] }),
  });

  const pauseMutation = useMutation({
    mutationFn: () => runsApi.pause(id!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['runs', id] }),
  });

  const stopMutation = useMutation({
    mutationFn: () => runsApi.stop(id!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['runs', id] }),
  });

  if (runLoading) {
    return <div className="text-center py-8 text-muted-foreground">読み込み中...</div>;
  }

  if (!run) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">Runが見つかりません</p>
        <Button className="mt-4" onClick={() => navigate('/runs')}>
          Run一覧に戻る
        </Button>
      </div>
    );
  }

  const budgetCap = run.budget_cap ?? 0;
  const spendTotal = run.spend_total ?? 0;
  const budgetProgress = budgetCap > 0 ? (spendTotal / budgetCap) * 100 : 0;
  const mode = run.mode ?? run.operationMode ?? '-';
  const createdAt = run.created_at ?? run.createdAt;
  const startedAt = run.started_at ?? run.launchedAt;
  const canLaunch = ['approved', 'paused', 'Approved', 'Paused'].includes(run.status);
  const canPause = ['running', 'live', 'Running', 'Live'].includes(run.status);
  const canStop = ['running', 'live', 'paused', 'Running', 'Live', 'Paused'].includes(run.status);

  return (
    <div className="space-y-6">
      <Button variant="ghost" onClick={() => navigate('/runs')}>
        <ArrowLeft className="mr-2 h-4 w-4" />
        Run一覧
      </Button>

      {/* Run header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">{run.name}</h1>
            <Badge>{statusLabels[run.status] ?? run.status}</Badge>
            <Badge variant="outline" className="capitalize">{mode}</Badge>
          </div>
          <p className="text-muted-foreground mt-2">
            作成日: {createdAt ? new Date(createdAt).toLocaleDateString('ja-JP') : '-'}
            {startedAt && ` / 開始日: ${new Date(startedAt).toLocaleDateString('ja-JP')}`}
          </p>
        </div>
        <div className="flex gap-2">
          {canLaunch && (
            <Button onClick={() => launchMutation.mutate()} disabled={launchMutation.isPending}>
              <Play className="mr-2 h-4 w-4" />
              {run.status === 'paused' ? '再開' : '開始'}
            </Button>
          )}
          {canPause && (
            <Button variant="outline" onClick={() => pauseMutation.mutate()} disabled={pauseMutation.isPending}>
              <Pause className="mr-2 h-4 w-4" />
              一時停止
            </Button>
          )}
          {canStop && (
            <Button variant="destructive" onClick={() => stopMutation.mutate()} disabled={stopMutation.isPending}>
              <Square className="mr-2 h-4 w-4" />
              停止
            </Button>
          )}
        </div>
      </div>

      {/* Budget progress */}
      {budgetCap > 0 && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">予算消化</span>
              <span className="text-sm text-muted-foreground">
                ¥{spendTotal.toLocaleString()} / ¥{budgetCap.toLocaleString()}
              </span>
            </div>
            <Progress value={budgetProgress} />
          </CardContent>
        </Card>
      )}

      {/* Decision/Report */}
      {report?.decision && (
        <Alert className={`border-${confidenceLabels[report.decision.confidence_level].variant}`}>
          <BarChart3 className="h-4 w-4" />
          <AlertTitle className="flex items-center gap-2">
            テスト結果
            <Badge variant={confidenceLabels[report.decision.confidence_level].variant}>
              {confidenceLabels[report.decision.confidence_level].label}
            </Badge>
          </AlertTitle>
          <AlertDescription>
            {report.decision.reasoning}
          </AlertDescription>
        </Alert>
      )}

      {/* Main content tabs */}
      <Tabs defaultValue="intents">
        <TabsList>
          <TabsTrigger value="intents">Intent</TabsTrigger>
          <TabsTrigger value="metrics">メトリクス</TabsTrigger>
          <TabsTrigger value="settings">設定</TabsTrigger>
        </TabsList>

        <TabsContent value="intents" className="mt-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Intent一覧</CardTitle>
                  <CardDescription>このRunの訴求バリエーション</CardDescription>
                </div>
                <Link to={`/runs/${id}/intents/new`}>
                  <Button size="sm">
                    <Plus className="mr-2 h-4 w-4" />
                    Intent追加
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {intents.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">まだIntentがありません</p>
                  <Link to={`/runs/${id}/intents/new`}>
                    <Button className="mt-4">
                      <Plus className="mr-2 h-4 w-4" />
                      最初のIntentを追加
                    </Button>
                  </Link>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Intent名</TableHead>
                      <TableHead>ターゲット</TableHead>
                      <TableHead>ステータス</TableHead>
                      <TableHead>CVR</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {intents.map((intent) => {
                      const ranking = report?.rankings.find((r) => r.intentId === intent.id);
                      const intentName = intent.name ?? intent.title ?? '-';
                      const targetAudience = intent.target_audience ?? intent.hypothesis ?? '-';
                      return (
                        <TableRow key={intent.id}>
                          <TableCell>
                            <Link
                              to={`/runs/${id}/intents/${intent.id}`}
                              className="font-medium hover:underline flex items-center gap-2"
                            >
                              {intentName}
                              {ranking?.isWinner && (
                                <CheckCircle className="h-4 w-4 text-green-600" />
                              )}
                            </Link>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {targetAudience}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{intent.status}</Badge>
                          </TableCell>
                          <TableCell>
                            {ranking ? (
                              <span>
                                {(ranking.cvr * 100).toFixed(2)}%
                                <span className="text-xs text-muted-foreground ml-1">
                                  ({(ranking.cvrCI[0] * 100).toFixed(1)}-{(ranking.cvrCI[1] * 100).toFixed(1)}%)
                                </span>
                              </span>
                            ) : (
                              '-'
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="metrics" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>メトリクス</CardTitle>
              <CardDescription>リアルタイムの計測データ</CardDescription>
            </CardHeader>
            <CardContent>
              {!report ? (
                <div className="text-center py-8 text-muted-foreground">
                  <AlertCircle className="mx-auto h-12 w-12 mb-4" />
                  <p>テストが開始されるとメトリクスが表示されます</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Ranking table */}
                  {report.rankings.length > 0 && (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>順位</TableHead>
                          <TableHead>Intent</TableHead>
                          <TableHead>CVR</TableHead>
                          <TableHead>95% CI</TableHead>
                          <TableHead>勝者</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {report.rankings.map((ranking) => (
                          <TableRow key={ranking.intentId}>
                            <TableCell className="font-bold">{ranking.rank}</TableCell>
                            <TableCell>{ranking.intentName}</TableCell>
                            <TableCell>{(ranking.cvr * 100).toFixed(2)}%</TableCell>
                            <TableCell className="text-muted-foreground">
                              {(ranking.cvrCI[0] * 100).toFixed(2)}% - {(ranking.cvrCI[1] * 100).toFixed(2)}%
                            </TableCell>
                            <TableCell>
                              {ranking.isWinner && (
                                <CheckCircle className="h-4 w-4 text-green-600" />
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}

                  {/* Recommendations */}
                  {report.recommendations.length > 0 && (
                    <div className="rounded-lg border p-4">
                      <h4 className="font-semibold mb-2">推奨アクション</h4>
                      <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                        {report.recommendations.map((rec, i) => (
                          <li key={i}>{rec}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="mt-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>テスト設計</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">比較軸</dt>
                    <dd>{run.run_design_json?.comparisonAxis || '-'}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">評価指標</dt>
                    <dd>{run.run_design_json?.targetMetric?.toUpperCase() || '-'}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">最低サンプル</dt>
                    <dd>{run.run_design_json?.minSampleSize || '-'}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">勝ち判定閾値</dt>
                    <dd>
                      {run.run_design_json?.winningThreshold
                        ? `${(run.run_design_json.winningThreshold * 100).toFixed(0)}%`
                        : '-'}
                    </dd>
                  </div>
                </dl>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>停止条件</CardTitle>
              </CardHeader>
              <CardContent>
                {run.stop_dsl_json && run.stop_dsl_json.length > 0 ? (
                  <ul className="space-y-2 text-sm">
                    {run.stop_dsl_json.map((rule, i) => (
                      <li key={i} className="flex justify-between">
                        <span className="text-muted-foreground">{rule.rule_type}</span>
                        <span>
                          {rule.threshold
                            ? `¥${rule.threshold.toLocaleString()}`
                            : rule.duration_hours
                              ? `${rule.duration_hours}時間`
                              : '-'}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-muted-foreground">停止条件が設定されていません</p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
